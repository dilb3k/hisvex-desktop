import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatMoney } from '../utils/formatters'

export type ChartMetric = 'revenue' | 'profit' | 'qty'

export interface ChartBucket {
  key: string
  fullLabel: string
  revenue: number
  profit: number
  qty: number
  isCurrent: boolean
}

export const METRIC_COLOR_VAR: Record<ChartMetric, string> = {
  revenue: 'var(--color-metric-revenue)',
  profit: 'var(--color-metric-profit)',
  qty: 'var(--color-metric-qty)',
}

function formatMetricValue(metric: ChartMetric, value: number): string {
  if (metric === 'qty') return `${Math.round(value).toLocaleString('uz-UZ')} dona`
  return formatMoney(value)
}

// Deterministic plausible-looking relative heights for the loading skeleton —
// fixed (not random) so it doesn't flicker/reshuffle on every re-render.
const SKELETON_HEIGHTS = [38, 62, 48, 74, 55, 68, 42, 58, 65, 40, 72, 50, 60, 45]

/**
 * Single-series bar chart built from plain divs (no chart library).
 * Reused both below the "Bu davr" hero and inside the All-Time modal.
 */
export function StatBarChart({
  buckets,
  metric,
  loading,
  emptyText,
  height = 140,
}: {
  buckets: ChartBucket[]
  metric: ChartMetric
  loading?: boolean
  emptyText: string
  height?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, padding: '0 2px' }}>
        {SKELETON_HEIGHTS.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 3,
              height: `${h}%`,
              borderRadius: '4px 4px 0 0',
              background: 'var(--color-border)',
              animation: 'pulse 1.4s ease-in-out infinite',
              animationDelay: `${(i % 7) * 0.09}s`,
            }}
          />
        ))}
      </div>
    )
  }

  // Guard divide-by-zero: if every bucket is 0 (or there are no buckets at
  // all), there is nothing meaningful to plot — show the empty state instead
  // of a chart full of invisible/NaN-height bars.
  const maxValue = buckets.length ? Math.max(0, ...buckets.map((b) => b[metric])) : 0
  const hasData = buckets.length > 0 && maxValue > 0

  if (!hasData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height,
          gap: 8,
          color: 'var(--color-text-tertiary)',
        }}
      >
        <BarChart3 size={26} strokeWidth={1.5} />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{emptyText}</span>
      </div>
    )
  }

  const color = METRIC_COLOR_VAR[metric]

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, padding: '0 2px' }}>
      {buckets.map((b) => {
        const raw = b[metric]
        const pct = maxValue > 0 ? Math.max((raw / maxValue) * 100, raw > 0 ? 3 : 0) : 0
        const isHovered = hovered === b.key
        return (
          <div
            key={b.key}
            style={{
              flex: 1,
              minWidth: 2,
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'flex-end',
            }}
            onMouseEnter={() => setHovered(b.key)}
            onMouseLeave={() => setHovered((h) => (h === b.key ? null : h))}
          >
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'var(--color-text)',
                  color: 'var(--color-bg)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ opacity: 0.7, fontSize: 10, marginBottom: 2, fontWeight: 500 }}>{b.fullLabel}</div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMetricValue(metric, raw)}</div>
              </div>
            )}
            <div
              style={{
                width: '100%',
                height: `${pct}%`,
                borderRadius: '4px 4px 0 0',
                background: color,
                opacity: b.isCurrent ? 1 : 0.35,
                outline: isHovered ? `1px solid ${color}` : 'none',
                outlineOffset: 1,
                transition: 'height 0.3s ease, opacity 0.15s ease',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
