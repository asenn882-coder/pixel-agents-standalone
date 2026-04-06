import { useState } from 'react'
import type { ManualTask } from '../hooks/useExtensionMessages.js'
import { vscode } from '../vscodeApi.js'

const STATUS_LABELS: Record<ManualTask['status'], string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
}

const STATUS_COLORS: Record<ManualTask['status'], string> = {
  todo: 'var(--pixel-text-dim)',
  in_progress: '#4fc3f7',
  done: '#81c784',
}

interface TaskPanelProps {
  tasks: ManualTask[]
}

export function TaskPanel({ tasks }: TaskPanelProps) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)

  function handleAdd() {
    const name = input.trim()
    if (!name) return
    vscode.postMessage({ type: 'createTask', name })
    setInput('')
  }

  function handleStatus(id: number, status: ManualTask['status']) {
    vscode.postMessage({ type: 'updateTask', id, status })
  }

  function handleDelete(id: number) {
    vscode.postMessage({ type: 'deleteTask', id })
  }

  const btnBase: React.CSSProperties = {
    padding: '3px 10px',
    fontSize: '18px',
    background: 'var(--pixel-btn-bg)',
    color: 'var(--pixel-text-dim)',
    border: '2px solid transparent',
    borderRadius: 0,
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        right: 8,
        zIndex: 50,
        width: 260,
      }}
    >
      {/* Toggle button */}
      <button
        style={{
          ...btnBase,
          width: '100%',
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          boxShadow: 'var(--pixel-shadow)',
          fontSize: '20px',
          color: open ? '#fff' : 'var(--pixel-text-dim)',
          marginBottom: open ? 0 : undefined,
          borderBottom: open ? '2px solid var(--pixel-bg)' : '2px solid var(--pixel-border)',
        }}
        onClick={() => setOpen((p) => !p)}
      >
        タスク ({tasks.length})
      </button>

      {open && (
        <div
          style={{
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-border)',
            borderTop: 'none',
            boxShadow: 'var(--pixel-shadow)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {/* Add task row */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="タスク名..."
              style={{
                flex: 1,
                padding: '3px 6px',
                fontSize: '18px',
                background: 'var(--pixel-input-bg, #1a1a2e)',
                color: '#fff',
                border: '2px solid var(--pixel-border)',
                borderRadius: 0,
                outline: 'none',
              }}
            />
            <button style={btnBase} onClick={handleAdd}>+</button>
          </div>

          {/* Task list */}
          {tasks.length === 0 && (
            <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', textAlign: 'center', padding: '8px 0' }}>
              タスクなし
            </div>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--pixel-border)',
                padding: '4px 6px',
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: '16px',
                  color: task.status === 'done' ? 'var(--pixel-text-dim)' : '#fff',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.name}
              </span>
              <select
                value={task.status}
                onChange={(e) => handleStatus(task.id, e.target.value as ManualTask['status'])}
                style={{
                  fontSize: '14px',
                  background: 'var(--pixel-btn-bg)',
                  color: STATUS_COLORS[task.status],
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  cursor: 'pointer',
                  padding: '1px 2px',
                }}
              >
                {(Object.keys(STATUS_LABELS) as ManualTask['status'][]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                style={{
                  ...btnBase,
                  padding: '1px 6px',
                  fontSize: '14px',
                  color: '#e57373',
                }}
                onClick={() => handleDelete(task.id)}
                title="削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
