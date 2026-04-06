import { useState, useCallback, useRef } from 'react'
import { OfficeState } from './office/engine/officeState.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { EditorState } from './office/editor/editorState.js'
import { EditTool } from './office/types.js'
import { isRotatable } from './office/layout/furnitureCatalog.js'
import { vscode } from './vscodeApi.js'
import { useExtensionMessages } from './hooks/useExtensionMessages.js'
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { ZoomControls } from './components/ZoomControls.js'
import { BottomToolbar } from './components/BottomToolbar.js'
import { DebugView } from './components/DebugView.js'
import { AgentStatusPanel } from './components/AgentStatusPanel.js'
import type { AgentEntry } from './components/AgentStatusPanel.js'

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  return officeStateRef.current
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
}

function EditActionBar({ editor, editorState: es }: { editor: ReturnType<typeof useEditorActions>; editorState: EditorState }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const undoDisabled = es.undoStack.length === 0
  const redoDisabled = es.redoStack.length === 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button
        style={actionBarBtnStyle}
        onClick={editor.handleSave}
        title="Save layout"
      >
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => { setShowResetConfirm(false); editor.handleReset() }}
          >
            Yes
          </button>
          <button
            style={actionBarBtnStyle}
            onClick={() => setShowResetConfirm(false)}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  const editor = useEditorActions(getOfficeState, editorState)

  const isEditDirty = useCallback(() => editor.isEditMode && editor.isDirty, [editor.isEditMode, editor.isDirty])

  const { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, agentProjectDirs, layoutReady, loadedAssets, workspaceFolders } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty)

  const [isDebugMode, setIsDebugMode] = useState(false)
  const [chatTarget, setChatTarget] = useState<{ id: number; name: string; projectDir: string } | null>(null)
  const [chatTask, setChatTask] = useState('')

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), [])

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id })
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  )

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id })
  }, [])

  const handleDoubleClickAgent = useCallback((id: number) => {
    const ch = getOfficeState().characters.get(id)
    const name = ch?.folderName || `エージェント${id}`
    const projectDir = agentProjectDirs[id] || '/root'
    setChatTask('')
    setChatTarget({ id, name, projectDir })
  }, [agentProjectDirs])

  const handleChatSubmit = useCallback(() => {
    if (!chatTarget || !chatTask.trim()) return
    vscode.postMessage({ type: 'createAgent', task: chatTask.trim(), workDir: chatTarget.projectDir })
    setChatTarget(null)
  }, [chatTarget, chatTask])

  const handleSpawnAgent = useCallback((task: string, workDir: string, name?: string) => {
    vscode.postMessage({ type: 'createAgent', task, workDir, name })
  }, [])

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState()
    const meta = os.subagentMeta.get(agentId)
    const focusId = meta ? meta.parentAgentId : agentId
    vscode.postMessage({ type: 'focusAgent', id: focusId })
  }, [])

  const officeState = getOfficeState()

  // Build agent status panel entries
  const agentStatusEntries: AgentEntry[] = [...agents, ...subagentCharacters.map((s) => s.id)].flatMap((id) => {
    const ch = officeState.characters.get(id)
    if (!ch) return []
    const isSub = ch.isSubagent
    const sub = isSub ? subagentCharacters.find((s) => s.id === id) : undefined
    const name = isSub ? `エージェント${sub?.parentAgentId ?? '?'}のサブ` : (ch.folderName || `エージェント${id}`)
    const hasPermission = agentTools[id]?.some((t) => t.permissionWait && !t.done) || (isSub && ch.bubbleType === 'permission')

    let statusLabel = ''
    let statusColor: string | null = null
    let isPulsing = false
    if (hasPermission) {
      statusLabel = '承認待ち'
      statusColor = 'var(--pixel-status-permission)'
    } else if (ch.isActive) {
      statusLabel = '進行中'
      statusColor = 'var(--pixel-status-active)'
      isPulsing = true
    } else {
      statusLabel = 'タスク待ち'
      statusColor = '#ffb74d'
    }

    let activityText = ''
    if (isSub) {
      if (ch.bubbleType === 'permission') {
        activityText = 'Needs approval'
      } else {
        activityText = sub ? sub.label : 'サブタスク'
      }
    } else {
      const tools = agentTools[id]
      if (tools && tools.length > 0) {
        const activeTool = [...tools].reverse().find((t) => !t.done)
        if (activeTool) {
          activityText = activeTool.permissionWait ? 'Needs approval' : activeTool.status
        } else if (ch.isActive) {
          activityText = tools[tools.length - 1]?.status ?? ''
        }
      }
    }

    return [{ id, name, statusLabel, statusColor, activityText, isPulsing }]
  })

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint = editor.isEditMode && (() => {
    if (editorState.selectedFurnitureUid) {
      const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
      if (item && isRotatable(item.type)) return true
    }
    if (editorState.activeTool === EditTool.FURNITURE_PLACE && isRotatable(editorState.selectedFurnitureType)) {
      return true
    }
    return false
  })()

  if (!layoutReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-foreground)' }}>
        Loading...
      </div>
    )
  }

  return (
    <>
    {chatTarget && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setChatTarget(null) }}
      >
        <div
          style={{
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-border-light)',
            boxShadow: 'var(--pixel-shadow)',
            padding: '16px 20px',
            minWidth: 320,
            maxWidth: 480,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: '24px', color: 'var(--pixel-text)', fontWeight: 'bold' }}>
            {chatTarget.name} にタスクを依頼
          </div>
          <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)' }}>
            {chatTarget.projectDir}
          </div>
          <div>
            <div style={{ fontSize: '20px', color: 'var(--pixel-text-dim)', marginBottom: 4 }}>タスク</div>
            <textarea
              autoFocus
              value={chatTask}
              onChange={(e) => setChatTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleChatSubmit() }}
              placeholder="例: このディレクトリのTypeScriptエラーを修正して"
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--vscode-input-background, #1e1e1e)',
                color: 'var(--vscode-input-foreground, #d4d4d4)',
                border: '1px solid var(--pixel-border)',
                padding: '6px 8px',
                fontSize: '20px',
                resize: 'vertical',
                borderRadius: 0,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setChatTarget(null)}
              style={{ padding: '5px 10px', fontSize: '22px', color: 'var(--pixel-text)', background: 'var(--pixel-btn-bg)', border: '2px solid transparent', borderRadius: 0, cursor: 'pointer' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleChatSubmit}
              disabled={!chatTask.trim()}
              style={{
                padding: '5px 10px',
                fontSize: '22px',
                background: chatTask.trim() ? 'var(--pixel-agent-bg)' : undefined,
                border: '2px solid var(--pixel-agent-border)',
                color: 'var(--pixel-agent-text)',
                borderRadius: 0,
                opacity: chatTask.trim() ? 1 : 0.4,
                cursor: chatTask.trim() ? 'pointer' : 'default',
              }}
            >
              依頼 (Ctrl+Enter)
            </button>
          </div>
        </div>
      </div>
    )}
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        onDoubleClickAgent={handleDoubleClickAgent}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
      />

      <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      <BottomToolbar
        isEditMode={editor.isEditMode}
        onOpenClaude={editor.handleOpenClaude}
        onToggleEditMode={editor.handleToggleEditMode}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        workspaceFolders={workspaceFolders}
        onSpawnAgent={handleSpawnAgent}
      />

      {editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: editor.isDirty ? 'translateX(calc(-50% + 100px))' : 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Press <b>R</b> to rotate
        </div>
      )}

      {editor.isEditMode && (() => {
        // Compute selected furniture color from current layout
        const selUid = editorState.selectedFurnitureUid
        const selColor = selUid
          ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null
          : null
        return (
          <EditorToolbar
            activeTool={editorState.activeTool}
            selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType}
            selectedFurnitureUid={selUid}
            selectedFurnitureColor={selColor}
            floorColor={editorState.floorColor}
            wallColor={editorState.wallColor}
            onToolChange={editor.handleToolChange}
            onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange}
            onWallColorChange={editor.handleWallColorChange}
            onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange}
            loadedAssets={loadedAssets}
          />
        )
      })()}

      <ToolOverlay
        officeState={officeState}
        agents={agents}
        agentTools={agentTools}
        subagentCharacters={subagentCharacters}
        containerRef={containerRef}
        zoom={editor.zoom}
        panRef={editor.panRef}
        onCloseAgent={handleCloseAgent}
      />

      <AgentStatusPanel entries={agentStatusEntries} />

      {isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}
    </div>
    </>
  )
}

export default App
