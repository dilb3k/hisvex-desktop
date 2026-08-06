import { useEffect, useRef, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

const isWin = typeof window !== 'undefined' ? !!window.electronAPI?.isWindows?.() : false

const s: Record<string, React.CSSProperties> = {
  bar: {
    display: isWin ? 'flex' : 'none',
    alignItems: 'center',
    height: 36,
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
    userSelect: 'none',
    zIndex: 9999,
  },
  title: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    paddingLeft: 14,
    color: 'var(--color-text)',
    opacity: 0.85,
    pointerEvents: 'none',
  },
  btn: {
    width: 44,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isWin) return
    window.electronAPI?.isMaximized().then(setMaximized)
    // onMaximizeChange returns an unsubscribe function — without calling it
    // on unmount, each mount of this component (e.g. a login/logout cycle
    // on a shared kiosk PC) leaks another ipcRenderer listener for the
    // process's lifetime.
    const unsubscribe = window.electronAPI?.onMaximizeChange(setMaximized)
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    el.style.setProperty('-webkit-app-region', 'drag')
    return () => { el.style.removeProperty('-webkit-app-region') }
  }, [])

  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = () => window.electronAPI?.maximizeWindow()
  const handleClose = () => window.electronAPI?.closeWindow()

  return (
    <div ref={barRef} style={s.bar}>
      <div style={s.title}>
        <img src="./Hisvex.png" alt="Hisvex" style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 5 }} />
        <span>Hisvex</span>
      </div>
      <button
        style={s.btn}
        onClick={handleMinimize}
        onMouseEnter={(e) => { e.currentTarget.style.setProperty('background', 'var(--color-border)') }}
        onMouseLeave={(e) => { e.currentTarget.style.setProperty('background', 'transparent') }}
      >
        <Minus size={14} />
      </button>
      <button
        style={s.btn}
        onClick={handleMaximize}
        onMouseEnter={(e) => { e.currentTarget.style.setProperty('background', 'var(--color-border)') }}
        onMouseLeave={(e) => { e.currentTarget.style.setProperty('background', 'transparent') }}
      >
        <Square size={11} />
      </button>
      <button
        style={s.btn}
        onClick={handleClose}
        onMouseEnter={(e) => {
          e.currentTarget.style.setProperty('background', '#e81123')
          e.currentTarget.style.setProperty('color', '#fff')
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.setProperty('background', 'transparent')
          e.currentTarget.style.setProperty('color', 'var(--color-text)')
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
