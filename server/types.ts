// Agent activity states
export type AgentActivity = "idle" | "typing" | "reading" | "waiting" | "permission";

// Tool info for speech bubbles
export interface ActiveTool {
  toolId: string;
  toolName: string;
  status: string;
}

// Agent as tracked by the server
export interface TrackedAgent {
  id: number;
  sessionId: string;
  projectDir: string;
  projectName: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activity: AgentActivity;
  activeTools: Map<string, ActiveTool>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  lastActivityTime: number;
}

// Messages sent from server to client via WebSocket
// Must match the upstream message format expected by useExtensionMessages
export type ServerMessage = TaskServerMessage
  | { type: "agentCreated"; id: number; folderName: string; projectDir?: string }
  | { type: "agentClosed"; id: number }
  | { type: "existingAgents"; agents: number[]; folderNames: Record<number, string>; projectDirs?: Record<number, string>; agentMeta?: Record<number, { palette?: number; hueShift?: number; seatId?: string }> }
  | { type: "agentToolStart"; id: number; toolId: string; status: string }
  | { type: "agentToolDone"; id: number; toolId: string }
  | { type: "agentToolsClear"; id: number }
  | { type: "agentStatus"; id: number; status: string }
  | { type: "agentToolPermission"; id: number }
  | { type: "agentToolPermissionClear"; id: number }
  | { type: "subagentToolStart"; id: number; parentToolId: string; toolId: string; status: string }
  | { type: "subagentToolDone"; id: number; parentToolId: string; toolId: string }
  | { type: "subagentToolPermission"; id: number; parentToolId: string }
  | { type: "subagentClear"; id: number; parentToolId: string }
  | { type: "characterSpritesLoaded"; characters: unknown[] }
  | { type: "floorTilesLoaded"; sprites: unknown[] }
  | { type: "wallTilesLoaded"; sprites: unknown[] }
  | { type: "furnitureAssetsLoaded"; catalog: unknown[]; sprites: Record<string, unknown> }
  | { type: "layoutLoaded"; layout: unknown; version: number }
  | { type: "settingsLoaded"; soundEnabled: boolean }
  | { type: "agentSpawning"; task: string }
  | { type: "agentSpawnError"; error: string }
  | { type: "ptyOpened"; termId: string }
  | { type: "ptyOutput"; termId: string; data: string }
  | { type: "ptyClosed"; termId: string };

// Manual task (UI-created, not from JSONL watcher)
export interface ManualTask {
  id: number;
  name: string;
  status: "todo" | "in_progress" | "done";
  createdAt: number;
}

// Messages sent from server to client via WebSocket
// Must match the upstream message format expected by useExtensionMessages
export type TaskServerMessage =
  | { type: "existingTasks"; tasks: ManualTask[] }
  | { type: "taskCreated"; task: ManualTask }
  | { type: "taskUpdated"; task: ManualTask }
  | { type: "taskDeleted"; id: number };

// Messages sent from client to server
export type ClientMessage =
  | { type: "ready" }
  | { type: "webviewReady" }
  | { type: "saveLayout"; layout: unknown }
  | { type: "saveAgentSeats"; seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> }
  | { type: "createTask"; name: string }
  | { type: "updateTask"; id: number; status: "todo" | "in_progress" | "done" }
  | { type: "deleteTask"; id: number }
  | { type: "createAgent"; task: string; workDir: string; name?: string }
  | { type: "openTerminal"; termId: string; workDir: string }
  | { type: "ptyInput"; termId: string; data: string }
  | { type: "ptyResize"; termId: string; cols: number; rows: number }
  | { type: "closeTerminal"; termId: string };
