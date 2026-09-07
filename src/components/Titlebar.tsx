import { useEffect, useRef, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

export const isWin = typeof window !== 'undefined' ? !!window.electronAPI?.isWindows?.() : false

// Height of the bar. Permanently on-screen now (see below) — exported so
// App.tsx can reserve exactly this much space for it in the layout below,
// rather than the two drifting out of sync as separate magic numbers.
export const BAR_HEIGHT = 36

const s: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    height: BAR_HEIGHT,
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
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
  const controlsRef = useRef<HTMLDivElement>(null)

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

  // `-webkit-app-region: drag` on the bar makes the whole strip a window
  // drag handle — Chromium then treats every mousedown inside it, including
  // on these buttons, as the start of a window drag rather than a click, so
  // minimize/maximize/close silently did nothing. The fix is to carve the
  // button cluster back out as a `no-drag` region (React's CSSProperties
  // typing doesn't know this non-standard property, same as the drag rule
  // above, so it's set imperatively rather than via the `style` prop).
  useEffect(() => {
    const el = controlsRef.current
    if (!el) return
    el.style.setProperty('-webkit-app-region', 'no-drag')
    return () => { el.style.removeProperty('-webkit-app-region') }
  }, [])

  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = () => window.electronAPI?.maximizeWindow()
  const handleClose = () => window.electronAPI?.closeWindow()

  if (!isWin) return null

  return (
    // Permanently visible — this used to auto-hide to a 6px sliver and
    // slide down on hover, which read as flaky rather than intentional
    // (the reveal/hide timing could catch a click mid-transition, and a
    // window with no visible minimize/maximize/close by default doesn't
    // look "in control"). A static bar can't have that class of bug.
    // App.tsx now reserves BAR_HEIGHT of space below it so it never
    // overlaps real content the way the hover-reveal could.
    <div ref={barRef} style={s.bar}>
      <div style={s.title}>
        <img src="./Hisvex.png" alt="Hisvex" style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 5 }} />
        <span>Hisvex</span>
      </div>
      <div ref={controlsRef} style={{ display: 'flex', alignItems: 'center' }}>
        <button
          style={s.btn}
          onClick={handleMinimize}
          aria-label="Kichraytirish"
          onMouseEnter={(e) => { e.currentTarget.style.setProperty('background', 'var(--color-border)') }}
          onMouseLeave={(e) => { e.currentTarget.style.setProperty('background', 'transparent') }}
        >
          <Minus size={14} />
        </button>
        <button
          style={s.btn}
          onClick={handleMaximize}
          aria-label={maximized ? 'Kichik oyna' : 'Katta oyna'}
          onMouseEnter={(e) => { e.currentTarget.style.setProperty('background', 'var(--color-border)') }}
          onMouseLeave={(e) => { e.currentTarget.style.setProperty('background', 'transparent') }}
        >
          <Square size={11} />
        </button>
        <button
          style={s.btn}
          onClick={handleClose}
          aria-label="Yopish"
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
    </div>
  )
}
