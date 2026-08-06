import { NavLink, useLocation } from 'react-router-dom'
import {
  Package,
  ClipboardList,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  UploadCloud,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { isOnline, subscribeOnline } from '../utils/network'
import { getPendingCount, subscribe as subscribeQueue } from '../store/offlineQueue'
import { syncNow } from '../store/syncEngine'

const navItems = [
  { to: '/', icon: BarChart3, labelKey: 'statistics' as const, roles: ['superAdmin', 'admin'] },
  { to: '/products', icon: Package, labelKey: 'products' as const, roles: ['superAdmin', 'admin'] },
  { to: '/inventory', icon: ClipboardList, labelKey: 'inventory' as const, roles: ['superAdmin', 'admin'] },
  { to: '/sales', icon: ShoppingCart, labelKey: 'sales' as const, roles: ['superAdmin', 'admin'] },
  { to: '/debtors', icon: Users, labelKey: 'debtors' as const, roles: ['superAdmin', 'admin'] },
  { to: '/users', icon: Shield, labelKey: 'users' as const, roles: ['superAdmin'] },
  { to: '/settings', icon: Settings, labelKey: 'settings' as const, roles: ['superAdmin', 'admin'] },
]

const iconBtn: React.CSSProperties = {
  width: 44, height: 44, border: 'none', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--color-text-tertiary)', borderRadius: 10, flexShrink: 0,
  transition: 'all 0.2s',
}

const getInitials = (name: string) =>
  name.split(/[\s_]+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '?'

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px', borderRadius: 12, textDecoration: 'none',
  fontSize: 15, fontWeight: 500,
  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
  background: active ? 'var(--color-primary-soft)' : 'transparent',
  transition: 'all 0.2s',
  borderLeft: active ? '3px solid var(--color-primary)' : '3px solid transparent',
  marginLeft: -3,
})

const navLinkCollapsed: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 52, borderRadius: 12, textDecoration: 'none',
  transition: 'all 0.2s',
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const showToast = useAppStore((s) => s.showToast)
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [online, setOnline] = useState(isOnline())
  const [pendingCount, setPendingCount] = useState(getPendingCount())
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const location = useLocation()

  const visibleItems = navItems.filter(item => item.roles.includes(user?.role || ''))
  const active = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  const handleRefresh = async () => {
    setRefreshing(true)
    try { await refreshAll() } finally { setRefreshing(false) }
  }

  // Live connectivity state — no polling needed, network.ts only notifies
  // on an actual (debounced) online/offline transition.
  useEffect(() => subscribeOnline(setOnline), [])

  // Live pending-queue count — offlineQueue.subscribe() fires synchronously
  // on every enqueue/removeSynced/clearQueue, so this updates the instant
  // an offline action queues something and the instant a sync drains it.
  useEffect(() => subscribeQueue(() => setPendingCount(getPendingCount())), [])

  const handleSyncNow = async () => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    const result = await syncNow()
    setPendingCount(getPendingCount())
    if (result.ok && result.error) {
      // Partial success: the sync call itself succeeded but the server
      // rejected some queued items (e.g. a business day that closed while
      // the item was queued offline) — those stay in the queue rather than
      // being silently discarded, so surface it distinctly from a full
      // success without treating it as a hard failure.
      setSyncState('success')
      showToast(result.error, 'info')
    } else if (result.ok) {
      setSyncState('success')
      showToast(t('syncSuccessToast'), 'success')
    } else {
      setSyncState('error')
      if (online) showToast(result.error || t('syncFailedToast'), 'error')
    }
    setTimeout(() => setSyncState('idle'), 2000)
  }

  if (collapsed) {
    return (
      <aside style={{
        width: 68, height: '100%', background: 'var(--color-sidebar)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width 0.2s',
      }}>
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 3, borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setCollapsed(false)} style={iconBtn} title="Expand">
            <ChevronRight size={20} />
          </button>
          <button onClick={handleRefresh} style={iconBtn} title={t('refresh')}>
            <RefreshCw size={20} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={handleSyncNow}
            disabled={!online || syncState === 'syncing'}
            style={{
              ...iconBtn,
              position: 'relative',
              color: !online ? 'var(--color-danger)' : pendingCount > 0 ? 'var(--color-warning)' : 'var(--color-success)',
              cursor: !online || syncState === 'syncing' ? 'default' : 'pointer',
              opacity: !online ? 0.6 : 1,
            }}
            title={
              !online
                ? t('syncOfflineTooltip')
                : syncState === 'syncing'
                  ? t('syncingNow')
                  : pendingCount > 0
                    ? t('syncPendingCount', { count: pendingCount })
                    : t('syncAllSynced')
            }
          >
            {online ? <Wifi size={20} style={{ animation: syncState === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none' }} /> : <WifiOff size={20} />}
            {pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 6, width: 8, height: 8,
                borderRadius: '50%', background: 'var(--color-warning)',
                border: '2px solid var(--color-sidebar)',
              }} />
            )}
          </button>
        </div>
        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {visibleItems.map((item) => (
            <NavLink
              key={item.to} to={item.to} end={item.to === '/'}
              style={{
                ...navLinkCollapsed,
                color: active(item.to) ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                background: active(item.to) ? 'var(--color-primary-soft)' : 'transparent',
              }}
              title={t(item.labelKey)}
            >
              <item.icon size={24} />
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '8px', borderTop: '1px solid var(--color-border)' }}>
          <button onClick={logout} style={{ ...iconBtn, color: 'var(--color-danger)' }} title={t('logout')}>
            <LogOut size={20} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 260, height: '100%', background: 'var(--color-sidebar)',
      borderRight: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width 0.2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'transparent' }}>
            <img src="./hisvex-logo.png" alt="Hisvex" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-primary)' }}>Hisvex</span>
        </div>
        <button onClick={handleRefresh} style={{ ...iconBtn, width: 36, height: 36 }} title={t('refresh')}>
          <RefreshCw size={18} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button onClick={() => setCollapsed(true)} style={{ ...iconBtn, width: 36, height: 36 }} title="Collapse">
          <ChevronLeft size={18} />
        </button>
      </div>

      <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to} to={item.to} end={item.to === '/'}
            style={() => navLinkStyle(active(item.to))}
          >
            <item.icon size={22} />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '10px 10px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 12,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: online ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
            color: online ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
              {online ? t('syncStatusOnline') : t('syncStatusOffline')}
            </div>
            <div style={{ fontSize: 11, color: pendingCount > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}>
              {pendingCount > 0 ? t('syncPendingCount', { count: pendingCount }) : t('syncAllSynced')}
            </div>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={!online || syncState === 'syncing'}
            style={{
              ...iconBtn, width: 32, height: 32,
              color: syncState === 'error'
                ? 'var(--color-danger)'
                : syncState === 'success'
                  ? 'var(--color-success)'
                  : 'var(--color-text-tertiary)',
              opacity: !online ? 0.5 : 1,
              cursor: !online || syncState === 'syncing' ? 'default' : 'pointer',
            }}
            title={!online ? t('syncOfflineTooltip') : t('syncNow')}
          >
            <UploadCloud size={18} style={{ animation: syncState === 'syncing' ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        {user && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 12,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, position: 'relative',
            }}>
              {getInitials(user.name || user.username)}
              <span style={{
                position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
                borderRadius: '50%', background: '#22c55e',
                border: '2px solid var(--color-sidebar)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name || user.username}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {user.role === 'superAdmin' ? t('superAdmin') : t('admin')}
              </div>
            </div>
          </div>
        )}
        <button onClick={logout} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 12, width: '100%',
          border: 'none', background: 'transparent',
          color: 'var(--color-text-tertiary)', fontSize: 14, cursor: 'pointer',
        }}>
          <LogOut size={20} />
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}
