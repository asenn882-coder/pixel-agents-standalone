import { useState } from 'react'
interface AgentEntry {
  id: number
  name: string
  statusLabel: string
  statusColor: string | null
  activityText: string
  isPulsing: boolean
}

interface AgentStatusPanelProps {
  entries: AgentEntry[]
}

export type { AgentEntry }

export function AgentStatusPanel({ entries }: AgentStatusPanelProps) {
  const [open, setOpen] = useState(true)

  if (entries.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 50,
        width: 240,
      }}
    >
      <button
        style={{
          width: '100%',
          padding: '3px 10px',
          fontSize: '18px',
          background: 'var(--pixel-bg)',
          color: open ? '#fff' : 'var(--pixel-text-dim)',
          border: '2px solid var(--pixel-border)',
          borderBottom: open ? '2px solid var(--pixel-bg)' : '2px solid var(--pixel-border)',
          borderRadius: 0,
          cursor: 'pointer',
          boxShadow: 'var(--pixel-shadow)',
          textAlign: 'left',
        }}
        onClick={() => setOpen((p) => !p)}
      >
        エージェント ({entries.length})
      </button>

      {open && (
        <div
          style={{
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-border)',
            borderTop: 'none',
            boxShadow: 'var(--pixel-shadow)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {entries.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--pixel-border)',
                padding: '4px 8px',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span
                  style={{
                    fontSize: '16px',
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {e.name}
                </span>
                {e.statusColor && (
                  <span
                    className={e.isPulsing ? 'pixel-agents-pulse' : undefined}
                    style={{
                      fontSize: '13px',
                      color: e.statusColor,
                      flexShrink: 0,
                    }}
                  >
                    {e.statusLabel}
                  </span>
                )}
              </div>
              {e.activityText && e.activityText !== 'Idle' && (
                <span
                  style={{
                    fontSize: '14px',
                    color: 'var(--pixel-text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.activityText}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
