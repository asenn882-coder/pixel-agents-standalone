import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { JsonlWatcher, type WatchedFile } from "./watcher.js";
import { processTranscriptLine, processSubagentLine } from "./parser.js";
import {
  loadCharacterSprites,
  loadWallTiles,
  loadFloorTiles,
  loadFurnitureAssets,
  loadDefaultLayout,
} from "./assetLoader.js";
import type { TrackedAgent, ServerMessage, ManualTask } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3456", 10);
const IDLE_SHUTDOWN_MS = 600_000; // 10 minutes

// State
const agents = new Map<string, TrackedAgent>(); // sessionId -> agent
// subagentSessions: subagent sessionId -> { parentAgentId, parentToolId }
const subagentSessions = new Map<string, { parentAgentId: number; parentToolId: string }>();
let nextAgentId = 1;
const clients = new Set<WebSocket>();
let lastActivityTime = Date.now();
// pending names for spawned agents: queue of names to assign to next new agents
const pendingAgentNames: string[] = [];
// custom names overrides: agentId -> name
const agentCustomNames = new Map<number, string>();

// Load assets at startup
// In dev mode (tsx), __dirname is server/ so assets are at ../webview-ui/public/assets/
// In production (esbuild), __dirname is dist/ so assets are at ./public/assets/
const devAssetsRoot = join(__dirname, "..", "webview-ui", "public", "assets");
const prodAssetsRoot = join(__dirname, "public", "assets");
const assetsRoot = existsSync(devAssetsRoot) ? devAssetsRoot : prodAssetsRoot;

console.log(`[Server] Loading assets from: ${assetsRoot}`);

const characterSprites = loadCharacterSprites(assetsRoot);
const wallTiles = loadWallTiles(assetsRoot);
const floorTiles = loadFloorTiles(assetsRoot);
const furnitureAssets = loadFurnitureAssets(assetsRoot);

// Persistence directory
const persistDir = join(homedir(), ".pixel-agents");
const persistedLayoutPath = join(persistDir, "layout.json");
const persistedSeatsPath = join(persistDir, "agent-seats.json");
const persistedTasksPath = join(persistDir, "tasks.json");

// Task state — IDs start at 10000 to avoid collision with agent IDs
const tasks = new Map<number, ManualTask>();
let nextTaskId = 10000;

function loadPersistedTasks(): void {
  if (existsSync(persistedTasksPath)) {
    try {
      const content = readFileSync(persistedTasksPath, "utf-8");
      const list = JSON.parse(content) as ManualTask[];
      for (const t of list) {
        tasks.set(t.id, t);
        if (t.id >= nextTaskId) nextTaskId = t.id + 1;
      }
      console.log(`[Server] Loaded ${list.length} persisted tasks`);
    } catch (err) {
      console.warn(`[Server] Failed to load persisted tasks: ${err instanceof Error ? err.message : err}`);
    }
  }
}

function saveTasks(): void {
  try {
    mkdirSync(persistDir, { recursive: true });
    writeFileSync(persistedTasksPath, JSON.stringify(Array.from(tasks.values()), null, 2));
  } catch (err) {
    console.error(`[Server] Failed to save tasks: ${err instanceof Error ? err.message : err}`);
  }
}

loadPersistedTasks();

// Load layout: persisted first, then default
function loadLayout(): Record<string, unknown> | null {
  if (existsSync(persistedLayoutPath)) {
    try {
      const content = readFileSync(persistedLayoutPath, "utf-8");
      const layout = JSON.parse(content) as Record<string, unknown>;
      console.log(`[Server] Loaded persisted layout from ${persistedLayoutPath}`);
      return layout;
    } catch (err) {
      console.warn(`[Server] Failed to load persisted layout: ${err instanceof Error ? err.message : err}`);
    }
  }
  return loadDefaultLayout(assetsRoot);
}

function loadPersistedSeats(): Record<number, { palette: number; hueShift: number; seatId: string | null }> | null {
  if (existsSync(persistedSeatsPath)) {
    try {
      const content = readFileSync(persistedSeatsPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

let currentLayout = loadLayout();
const persistedSeats = loadPersistedSeats();

// Express app
const app = express();
// No-cache for HTML to prevent stale JS references after rebuild
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  next();
});
// Serve production build
app.use(express.static(join(__dirname, "public")));

const server = createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

// Ping/pong heartbeat — keeps clients Set accurate for shutdown guard
const HEARTBEAT_INTERVAL_MS = 30_000;
setInterval(() => {
  for (const ws of clients) {
    if ((ws as unknown as Record<string, boolean>).__isAlive === false) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    (ws as unknown as Record<string, boolean>).__isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function sendInitialData(ws: WebSocket): void {
  // Send settings
  ws.send(JSON.stringify({ type: "settingsLoaded", soundEnabled: false }));

  // Send character sprites
  if (characterSprites) {
    ws.send(JSON.stringify({ type: "characterSpritesLoaded", characters: characterSprites.characters }));
  }

  // Send wall tiles
  if (wallTiles) {
    ws.send(JSON.stringify({ type: "wallTilesLoaded", sprites: wallTiles.sprites }));
  }

  // Send floor tiles (optional)
  if (floorTiles) {
    ws.send(JSON.stringify({ type: "floorTilesLoaded", sprites: floorTiles.sprites }));
  }

  // Send furniture assets (optional)
  if (furnitureAssets) {
    ws.send(
      JSON.stringify({
        type: "furnitureAssetsLoaded",
        catalog: furnitureAssets.catalog,
        sprites: furnitureAssets.sprites,
      }),
    );
  }

  // Send existing agents with persisted seat metadata
  const agentList = Array.from(agents.values());
  const agentIds = agentList.map((a) => a.id);
  const folderNames: Record<number, string> = {};
  const projectDirs: Record<number, string> = {};
  const agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }> = {};
  const agentStatuses: Record<number, string> = {};
  for (const a of agentList) {
    folderNames[a.id] = agentCustomNames.get(a.id) || a.projectName;
    projectDirs[a.id] = a.projectDir;
    if (persistedSeats?.[a.id]) {
      const s = persistedSeats[a.id];
      agentMeta[a.id] = { palette: s.palette, hueShift: s.hueShift, seatId: s.seatId ?? undefined };
    }
    if (a.isWaiting) {
      agentStatuses[a.id] = "waiting";
    }
  }
  ws.send(JSON.stringify({ type: "existingAgents", agents: agentIds, folderNames, projectDirs, agentMeta, agentStatuses }));

  // Send layout (must come after existingAgents — the hook buffers agents until layout arrives)
  if (currentLayout) {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: currentLayout, version: 1 }));
  } else {
    // Send null layout to trigger default layout creation in the UI
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: null, version: 0 }));
  }

  // Replay active tool state AFTER layoutLoaded — agents are added to officeState inside layoutLoaded,
  // so addSubagent() can only succeed after that point.
  for (const agent of agentList) {
    console.log(`[sendInitialData] agent ${agent.id} activeTools=${agent.activeTools.size}:`, [...agent.activeTools.entries()].map(([k, v]) => `${k}=${v.status}`));
    console.log(`[sendInitialData] agent ${agent.id} activeSubagentToolIds=${agent.activeSubagentToolIds.size}`);
    for (const [toolId, tool] of agent.activeTools) {
      ws.send(JSON.stringify({ type: "agentToolStart", id: agent.id, toolId, status: tool.status }));
    }
    for (const [parentToolId, subToolIds] of agent.activeSubagentToolIds) {
      const subNames = agent.activeSubagentToolNames.get(parentToolId);
      for (const toolId of subToolIds) {
        const toolName = subNames?.get(toolId) ?? "";
        const status = toolName ? `Using ${toolName}` : "Working";
        ws.send(JSON.stringify({ type: "subagentToolStart", id: agent.id, parentToolId, toolId, status }));
      }
    }
  }

  // Send existing tasks
  ws.send(JSON.stringify({ type: "existingTasks", tasks: Array.from(tasks.values()) }));
}

wss.on("connection", (ws) => {
  (ws as unknown as Record<string, boolean>).__isAlive = true;
  ws.on("pong", () => { (ws as unknown as Record<string, boolean>).__isAlive = true; });
  clients.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "webviewReady" || msg.type === "ready") {
        sendInitialData(ws);
      } else if (msg.type === "saveLayout") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedLayoutPath, JSON.stringify(msg.layout, null, 2));
          currentLayout = msg.layout as Record<string, unknown>;
          // Broadcast to other clients for multi-tab sync
          const data = JSON.stringify({ type: "layoutLoaded", layout: msg.layout, version: 1 });
          for (const client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          }
        } catch (err) {
          console.error(`[Server] Failed to save layout: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "saveAgentSeats") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedSeatsPath, JSON.stringify(msg.seats, null, 2));
        } catch (err) {
          console.error(`[Server] Failed to save agent seats: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "createTask") {
        const task: ManualTask = {
          id: nextTaskId++,
          name: String(msg.name).slice(0, 100),
          status: "todo",
          createdAt: Date.now(),
        };
        tasks.set(task.id, task);
        saveTasks();
        broadcast({ type: "taskCreated", task });
      } else if (msg.type === "updateTask") {
        const task = tasks.get(Number(msg.id));
        if (task) {
          task.status = msg.status;
          saveTasks();
          broadcast({ type: "taskUpdated", task });
        }
      } else if (msg.type === "deleteTask") {
        const id = Number(msg.id);
        if (tasks.has(id)) {
          tasks.delete(id);
          saveTasks();
          broadcast({ type: "taskDeleted", id });
        }
      } else if (msg.type === "createAgent") {
        const task = String(msg.task || "").trim();
        const workDir = String(msg.workDir || homedir()).trim();
        const agentName = String(msg.name || "").trim();
        if (!task) return;
        if (!existsSync(workDir)) {
          ws.send(JSON.stringify({ type: "agentSpawnError", error: `ディレクトリが見つかりません: ${workDir}` }));
          return;
        }
        if (agentName) {
          pendingAgentNames.push(agentName);
        }
        const claudeBin = process.env.CLAUDE_BIN || "claude";
        const args = ["-p", task];
        if (process.getuid && process.getuid() !== 0) {
          args.push("--dangerously-skip-permissions");
        }
        const proc = spawn(claudeBin, args, {
          cwd: workDir,
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        });
        proc.unref();
        console.log(`[createAgent] Spawning ${claudeBin} -p "${task.slice(0, 60)}" in ${workDir}${agentName ? ` name="${agentName}"` : ""}`);
        ws.send(JSON.stringify({ type: "agentSpawning", task }));
      }
    } catch {
      /* ignore invalid messages */
    }
  });

  ws.on("close", () => clients.delete(ws));
});

// Watcher
const watcher = new JsonlWatcher();

watcher.on("fileAdded", (file: WatchedFile) => {
  // Subagent JSONL file
  if (file.parentSessionId) {
    if (subagentSessions.has(file.sessionId)) return;
    lastActivityTime = Date.now();

    const parentAgent = agents.get(file.parentSessionId);
    if (!parentAgent) {
      console.log(`[Subagent] Parent session ${file.parentSessionId.slice(0, 8)} not tracked, skipping ${file.sessionId.slice(0, 8)}`);
      return;
    }

    // Try to read description from meta.json (stored alongside the JSONL as {sessionId}.meta.json)
    let description = "";
    const metaPath = join(dirname(file.path), `${file.sessionId}.meta.json`);
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
        description = typeof meta.description === "string" ? meta.description : "";
      } catch {
        /* ignore */
      }
    }

    // Try to find a matching Agent tool_use in the parent's active tools
    let parentToolId: string | null = null;
    for (const [toolId, toolName] of parentAgent.activeToolNames) {
      if (toolName === "Agent" || toolName === "Task") {
        if (!parentToolId) parentToolId = toolId; // pick first match
        // If we have a description, try to match more precisely
        if (description) {
          const tool = parentAgent.activeTools.get(toolId);
          if (tool && tool.status.includes(description.slice(0, 20))) {
            parentToolId = toolId;
            break;
          }
        }
      }
    }

    // No matching tool found — emit synthetic agentToolStart
    if (!parentToolId) {
      parentToolId = `subagent-${file.sessionId}`;
      const truncated = description.length > 40 ? description.slice(0, 40) + "\u2026" : description;
      const status = truncated ? `Subtask: ${truncated}` : "Subtask: agent";
      parentAgent.activeTools.set(parentToolId, { toolId: parentToolId, toolName: "Agent", status });
      parentAgent.activeToolNames.set(parentToolId, "Agent");
      broadcast({ type: "agentToolStart", id: parentAgent.id, toolId: parentToolId, status });
      console.log(`[Subagent] Synthetic agentToolStart for ${file.sessionId.slice(0, 8)} → parent ${parentAgent.id}`);
    } else {
      console.log(`[Subagent] Matched tool ${parentToolId.slice(0, 8)} in parent ${parentAgent.id} for ${file.sessionId.slice(0, 8)}`);
    }

    subagentSessions.set(file.sessionId, { parentAgentId: parentAgent.id, parentToolId });
    return;
  }

  // Normal parent agent JSONL file
  if (agents.has(file.sessionId)) return;
  lastActivityTime = Date.now();

  const agent: TrackedAgent = {
    id: nextAgentId++,
    sessionId: file.sessionId,
    projectDir: dirname(file.path),
    projectName: file.projectName,
    jsonlFile: file.path,
    fileOffset: 0,
    lineBuffer: "",
    activity: "idle",
    activeTools: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastActivityTime: Date.now(),
  };

  agents.set(file.sessionId, agent);
  // Assign pending custom name if any
  const pendingName = pendingAgentNames.shift();
  if (pendingName) {
    agentCustomNames.set(agent.id, pendingName);
  }
  const displayName = agentCustomNames.get(agent.id) || agent.projectName;
  broadcast({ type: "agentCreated", id: agent.id, folderName: displayName, projectDir: agent.projectDir });
  console.log(`Agent ${agent.id} joined: ${displayName} (${file.sessionId.slice(0, 8)})`);
});

watcher.on("fileRemoved", (file: WatchedFile) => {
  // Subagent file removed
  if (file.parentSessionId) {
    const sub = subagentSessions.get(file.sessionId);
    if (!sub) return;
    subagentSessions.delete(file.sessionId);
    // Emit subagentClear so the frontend removes the subagent character
    broadcast({ type: "subagentClear", id: sub.parentAgentId, parentToolId: sub.parentToolId });
    // Also clean up parent agent's subagent tracking
    const parentAgent = agents.get(file.parentSessionId);
    if (parentAgent) {
      parentAgent.activeSubagentToolIds.delete(sub.parentToolId);
      parentAgent.activeSubagentToolNames.delete(sub.parentToolId);
    }
    return;
  }

  const agent = agents.get(file.sessionId);
  if (!agent) return;

  agents.delete(file.sessionId);
  broadcast({ type: "agentClosed", id: agent.id });
  console.log(`Agent ${agent.id} left: ${agent.projectName}`);
});

watcher.on("line", (file: WatchedFile, line: string) => {
  lastActivityTime = Date.now();

  // Subagent JSONL line
  if (file.parentSessionId) {
    const sub = subagentSessions.get(file.sessionId);
    if (!sub) return;
    const parentAgent = agents.get(file.parentSessionId);
    if (!parentAgent) return;
    processSubagentLine(line, sub.parentAgentId, sub.parentToolId, parentAgent, broadcast);
    return;
  }

  const agent = agents.get(file.sessionId);
  if (!agent) return;

  processTranscriptLine(line, agent, broadcast);
});

// Start
watcher.start();
server.listen(PORT, () => {
  console.log(`Pixel Agents server running at http://localhost:${PORT}`);
  console.log(`Watching ~/.claude/projects/ for active sessions...`);
});

// Idle shutdown
setInterval(() => {
  if (agents.size === 0 && clients.size === 0 && Date.now() - lastActivityTime > IDLE_SHUTDOWN_MS) {
    console.log("No active sessions or clients for 10 minutes, shutting down...");
    watcher.stop();
    server.close();
    process.exit(0);
  }
}, 30_000);

// Graceful shutdown
process.on("SIGINT", () => {
  watcher.stop();
  server.close();
  process.exit(0);
});
