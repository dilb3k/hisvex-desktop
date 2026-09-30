import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { isOnline, subscribeOnline } from '../utils/network'
import { getPendingCount, subscribe as subscribeQueue } from '../store/offlineQueue'
import { t } from '../i18n'

// isOnline() (utils/network.ts) is backed by an active health check through
// the failover-aware `api` instance (see api/client.ts's healthApi.check) —
// it only goes false once BOTH Railway and Render fail to answer, not just
// the primary. This banner is therefore the "database/network is genuinely
// unreachable, not just failed over" signal: a plain failover (primary down,
// backup serving fine) never shows it, since isOnline() stays true. Kept
// calm/yellow rather than red or a blocking modal — the whole point is that
// the cashier can keep working uninterrupted; the offline queue (already
// wired into every write path — see Sales/Products/InventoryScreen) is
// quietly doing its job underneath this.
export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline())
  const [pending, setPending] = useState(getPendingCount())

  useEffect(() => subscribeOnline(setOnline), [])
  useEffect(() => subscribeQueue(() => setPending(getPendingCount())), [])

  if (online) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'var(--color-warning-soft)',
        borderBottom: '1px solid rgba(245,158,11,0.25)',
        color: 'var(--color-warning)',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {t('dbOfflineBanner')}
        {pending > 0 ? ` (${pending})` : ''}
      </span>
    </div>
  )
}
