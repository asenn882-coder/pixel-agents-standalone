import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalModalProps {
  termId: string
  agentName: string
  projectDir: string
  onClose: () => void
  onInput: (termId: string, data: string) => void
  onResize: (termId: string, cols: number, rows: number) => void
  outputQueue: string[]
  isClosed: boolean
}

export function TerminalModal({
  termId,
  agentName,
  projectDir,
  onClose,
  onInput,
  onResize,
  outputQueue,
  isClosed,
}: TerminalModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const outputIndexRef = useRef(0)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#e8e8e8',
        black: '#1a1a1a',
        red: '#ff5f5f',
        green: '#5fff5f',
        yellow: '#ffff5f',
        blue: '#5f87ff',
        magenta: '#ff5fff',
        cyan: '#5fffff',
        white: '#e8e8e8',
        brightBlack: '#666666',
        brightRed: '#ff8787',
        brightGreen: '#87ff87',
        brightYellow: '#ffff87',
        brightBlue: '#87afff',
        brightMagenta: '#ff87ff',
        brightCyan: '#87ffff',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon
    outputIndexRef.current = 0

    term.onData((data) => {
      onInput(termId, data)
    })

    // Observe resize
    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      onResize(termId, term.cols, term.rows)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [termId, onInput, onResize])

  // Drain output queue
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    while (outputIndexRef.current < outputQueue.length) {
      term.write(outputQueue[outputIndexRef.current])
      outputIndexRef.current++
    }
  }, [outputQueue])

  // Show "session closed" banner when PTY exits
  useEffect(() => {
    const term = termRef.current
    if (isClosed && term) {
      term.write('\r\n\x1b[33m[セッション終了 — Enterで閉じる]\x1b[0m\r\n')
    }
  }, [isClosed])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose],
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #444',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          width: 'min(900px, 92vw)',
          height: 'min(600px, 85vh)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#1a1a1a',
            borderBottom: '1px solid #333',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 13, color: '#e8e8e8', fontFamily: 'monospace' }}>
              claude — {agentName}
            </span>
            <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
              {projectDir}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: '2px 6px',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#888')}
          >
            ×
          </button>
        </div>

        {/* Terminal */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', padding: '4px' }}
        />
      </div>
    </div>
  )
}
