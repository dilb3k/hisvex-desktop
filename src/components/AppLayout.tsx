import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Titlebar } from './Titlebar'
import { useAppStore } from '../store/appStore'
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react'

export function AppLayout() {
  const { error, clearError, toast, hideToast } = useAppStore()

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}>
        <Titlebar />
        {error && (
          <div
            className="animate-slideUp"
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 20px',
              background: 'var(--color-danger-soft)',
              borderBottom: '1px solid rgba(239,68,68,0.25)',
              color: 'var(--color-danger)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={clearError}
              aria-label="Close error"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-danger)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
                opacity: 0.7,
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
        }}>
          <Outlet />
        </div>
      </main>
      {toast.visible && (
        <div
          className="animate-slideUp"
          onClick={hideToast}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 10,
            background: toast.type === 'success' ? 'var(--color-success)' : toast.type === 'error' ? 'var(--color-danger)' : 'var(--color-info)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)',
            cursor: 'pointer',
            maxWidth: 400,
          }}
        >
          {toast.type === 'success' ? <CheckCircle size={18} /> : toast.type === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
