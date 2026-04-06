import { useState, useEffect, useRef } from 'react'
import { SettingsModal } from './SettingsModal.js'
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js'
import { vscode } from '../vscodeApi.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onOpenClaude: () => void
  onToggleEditMode: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
  workspaceFolders: WorkspaceFolder[]
  onSpawnAgent?: (task: string, workDir: string, name?: string) => void
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-active-bg)',
  border: '2px solid var(--pixel-accent)',
}


export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  workspaceFolders,
  onSpawnAgent,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [hoveredFolder, setHoveredFolder] = useState<number | null>(null)
  const folderPickerRef = useRef<HTMLDivElement>(null)
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false)
  const [spawnTask, setSpawnTask] = useState('')
  const [spawnWorkDir, setSpawnWorkDir] = useState('/root')
  const [spawnName, setSpawnName] = useState('')

  // Close folder picker on outside click
  useEffect(() => {
    if (!isFolderPickerOpen) return
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isFolderPickerOpen])

  const hasMultipleFolders = workspaceFolders.length > 1

  const handleAgentClick = () => {
    if (onSpawnAgent) {
      setSpawnTask('')
      setSpawnName('')
      setIsSpawnModalOpen(true)
      return
    }
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v)
    } else {
      onOpenClaude()
    }
  }

  const handleSpawnSubmit = () => {
    if (!spawnTask.trim()) return
    onSpawnAgent!(spawnTask.trim(), spawnWorkDir.trim() || '/root', spawnName.trim() || undefined)
    setIsSpawnModalOpen(false)
  }

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false)
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path })
  }

  return (
    <>
    {isSpawnModalOpen && (
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
        onClick={(e) => { if (e.target === e.currentTarget) setIsSpawnModalOpen(false) }}
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
            新しいエージェントを起動
          </div>
          <div>
            <div style={{ fontSize: '20px', color: 'var(--pixel-text-dim)', marginBottom: 4 }}>タスク</div>
            <textarea
              autoFocus
              value={spawnTask}
              onChange={(e) => setSpawnTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSpawnSubmit() }}
              placeholder="例: src/以下のTypeScriptエラーを全部修正して"
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
          <div>
            <div style={{ fontSize: '20px', color: 'var(--pixel-text-dim)', marginBottom: 4 }}>エージェント名（省略可）</div>
            <input
              type="text"
              value={spawnName}
              onChange={(e) => setSpawnName(e.target.value)}
              placeholder="例: フロントエンド担当"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--vscode-input-background, #1e1e1e)',
                color: 'var(--vscode-input-foreground, #d4d4d4)',
                border: '1px solid var(--pixel-border)',
                padding: '5px 8px',
                fontSize: '20px',
                borderRadius: 0,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '20px', color: 'var(--pixel-text-dim)', marginBottom: 4 }}>作業ディレクトリ</div>
            <input
              type="text"
              value={spawnWorkDir}
              onChange={(e) => setSpawnWorkDir(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--vscode-input-background, #1e1e1e)',
                color: 'var(--vscode-input-foreground, #d4d4d4)',
                border: '1px solid var(--pixel-border)',
                padding: '5px 8px',
                fontSize: '20px',
                borderRadius: 0,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsSpawnModalOpen(false)}
              style={{ ...btnBase, fontSize: '22px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSpawnSubmit}
              disabled={!spawnTask.trim()}
              style={{
                ...btnBase,
                fontSize: '22px',
                background: spawnTask.trim() ? 'var(--pixel-agent-bg)' : undefined,
                border: '2px solid var(--pixel-agent-border)',
                color: 'var(--pixel-agent-text)',
                opacity: spawnTask.trim() ? 1 : 0.4,
                cursor: spawnTask.trim() ? 'pointer' : 'default',
              }}
            >
              起動 (Ctrl+Enter)
            </button>
          </div>
        </div>
      </div>
    )}
    <div style={panelStyle}>
      <div ref={folderPickerRef} style={{ position: 'relative' }}>
        <button
          onClick={handleAgentClick}
          onMouseEnter={() => setHovered('agent')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...btnBase,
            padding: '5px 12px',
            background:
              hovered === 'agent' || isFolderPickerOpen
                ? 'var(--pixel-agent-hover-bg)'
                : 'var(--pixel-agent-bg)',
            border: '2px solid var(--pixel-agent-border)',
            color: 'var(--pixel-agent-text)',
          }}
        >
          + Agent
        </button>
        {isFolderPickerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 160,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            {workspaceFolders.map((folder, i) => (
              <button
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                onMouseEnter={() => setHoveredFolder(i)}
                onMouseLeave={() => setHoveredFolder(null)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: '22px',
                  color: 'var(--pixel-text)',
                  background: hoveredFolder === i ? 'var(--pixel-btn-hover-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background: hovered === 'settings' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
        />
      </div>
    </div>
    </>
  )
}
