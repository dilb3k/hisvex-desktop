import { useEffect, useState, useMemo, useCallback, forwardRef } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { inventoryApi } from '../api/client'
import { useAppStore } from '../store/appStore'
import dayjs from 'dayjs'
import {
  Download, CalendarClock, RefreshCw, TrendingUp, TrendingDown, X, ChevronLeft, ChevronRight,
  Wallet, ShoppingCart, Percent, AlertTriangle,
} from 'lucide-react'
import { t } from '../i18n'
import { getBusinessDate } from '../utils/businessDay'
import { formatMoney, spinner } from '../styles/shared'
import { resolveSellPrice, resolveBuyPrice } from '../utils/inventory'
import { StatBarChart, type ChartMetric, type ChartBucket } from '../components/StatBarChart'
import { enumerateDays, enumerateMonths, buildDayBuckets, buildMonthBuckets } from '../utils/statsBuckets'
import type { InventorySummary } from '../types'

type Period = 'daily' | 'monthly' | 'yearly'

const PERIODS: Period[] = ['daily', 'monthly', 'yearly']
const PERIOD_LABELS: Record<Period, string> = {
  daily: t('daily'),
  monthly: t('monthly'),
  yearly: t('yearly'),
}

function getPeriodRange(period: Period, date: string) {
  const d = dayjs(date)
  switch (period) {
    case 'daily': return { from: date, to: date }
    case 'monthly': return { from: d.startOf('month').format('YYYY-MM-DD'), to: d.endOf('month').format('YYYY-MM-DD') }
    case 'yearly': return { from: d.startOf('year').format('YYYY-MM-DD'), to: d.endOf('year').format('YYYY-MM-DD') }
  }
}

function formatPeriodLabel(period: Period, date: string) {
  const d = dayjs(date)
  switch (period) {
    case 'daily': return d.format('DD MMMM YYYY')
    case 'monthly': return d.format('MMMM YYYY')
    case 'yearly': return d.format('YYYY')
  }
}

function navigateDate(period: Period, date: string, dir: -1 | 1) {
  const d = dayjs(date)
  const unit = period === 'daily' ? 'day' : period === 'monthly' ? 'month' : 'year'
  return d.add(dir, unit).format('YYYY-MM-DD')
}

interface ProductRankItem {
  id: string
  name: string
  sold: number
  profit: number
}

function buildProductRankings(inventoryItems: any[]): ProductRankItem[] {
  const seen = new Map<string, { sold: number; profit: number; name: string }>()

  for (const item of inventoryItems) {
    const p = item.product
    if (!p) continue
    const id = p._id || p.id
    if (!id) continue
    const opening = item.startQuantity ?? item.openingQuantity ?? 0
    const sold = item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0)
    const cur = seen.get(id) ?? { sold: 0, profit: 0, name: p.name || 'Noma\'lum' }
    cur.sold += sold
    const sp = resolveSellPrice(item, p)
    const bp = resolveBuyPrice(item, p)
    cur.profit += item.realizedProfit ?? (sold * (sp - bp))
    seen.set(id, cur)
  }

  return Array.from(seen.entries()).map(([id, totals]) => ({
    id,
    name: totals.name,
    sold: totals.sold,
    profit: totals.profit,
  }))
}

const CARD: React.CSSProperties = {
  padding: 24,
  borderRadius: 16,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  transition: 'all 0.2s',
}

const STAT_LABEL: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  margin: 0,
  marginBottom: 4,
  fontWeight: 500,
}

const STAT_VALUE: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
  fontVariantNumeric: 'tabular-nums',
}

// The three metric identities used consistently across the KPI accent dots,
// the Section A chart, and the ranking bar-fill — validated hexes live as
// CSS custom properties in globals.css (`--color-metric-*`), themed per
// light/dark. Do not substitute `--color-primary`/`--color-success` here;
// those failed the dataviz-skill contrast validation for this specific job.
const METRIC_OPTIONS: { key: ChartMetric; label: string; colorVar: string }[] = [
  { key: 'revenue', label: t('metricRevenue') || 'Tushum', colorVar: 'var(--color-metric-revenue)' },
  { key: 'profit', label: t('netProfit') || 'Sof foyda', colorVar: 'var(--color-metric-profit)' },
  { key: 'qty', label: t('soldPieces') || 'Sotilgan dona', colorVar: 'var(--color-metric-qty)' },
]

const s = {
  container: { maxWidth: 780, margin: '0 auto' },
  pageHeader: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, marginBottom: 18 },
  pageTitle: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.3, color: 'var(--color-text)' },
  pageSubtitle: { fontSize: 13, color: 'var(--color-text-secondary)', margin: '2px 0 0' },
  primaryBtn: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 6, padding: '9px 14px', borderRadius: 10,
    border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 6, padding: '9px 14px', borderRadius: 10,
    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    color: 'var(--color-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabsRow: { display: 'flex' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
  periodTabs: {
    flex: 1, display: 'flex' as const, background: 'var(--color-surface)', borderRadius: 12, padding: 3,
    border: '1px solid var(--color-border)',
  },
  periodTab: (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', border: 'none', borderRadius: 9,
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    fontWeight: active ? 700 : 600, fontSize: 13, cursor: 'pointer',
    transition: 'all 0.2s',
  }),
  refreshBtn: {
    width: 42, height: 42, borderRadius: 12, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', color: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  hero: {
    position: 'relative' as const, overflow: 'hidden' as const,
    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 55%, #4c1d95 100%)',
    borderRadius: 18, padding: '24px 26px', marginBottom: 14,
  },
  heroCircle1: { position: 'absolute' as const, top: -50, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' },
  heroCircle2: { position: 'absolute' as const, bottom: -70, left: 80, width: 170, height: 170, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' },
  heroLabel: {
    position: 'relative' as const, display: 'flex' as const, alignItems: 'center' as const, gap: 8,
    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  // Responsive clamp so full-precision Uzbek-grouped soms (this app's core
  // promise — never abbreviated) never clip/overflow at any window width.
  heroValue: { position: 'relative' as const, fontSize: 'clamp(24px, 4.2vw, 34px)', fontWeight: 800, color: '#fff', marginTop: 8, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' as const, wordBreak: 'break-word' as const },
  heroChips: { position: 'relative' as const, display: 'flex' as const, gap: 8, marginTop: 14, flexWrap: 'wrap' as const },
  heroChip: { padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' as const },
  kpiGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  kpiCard: {
    background: 'var(--color-surface)', borderRadius: 14, padding: 16, border: '1px solid var(--color-border)',
    display: 'flex' as const, alignItems: 'center' as const, gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  kpiIcon: { width: 42, height: 42, borderRadius: 12, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, flexShrink: 0 },
  kpiLabel: { fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 },
  kpiValue: { fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: -0.3 },

  // Section eyebrow labels — reuses the existing small-caps convention
  // already used elsewhere in the app (see ProductsScreen's pre-save-check
  // label) rather than inventing a new header style.
  sectionEyebrow: (first?: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: first ? 0 : 26, marginBottom: 10,
  }),
  sectionSubtitle: { fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2, marginBottom: 4, fontWeight: 500 },

  // Chart card (Section A)
  chartCard: { ...CARD, padding: 18, marginBottom: 0 } as React.CSSProperties,
  metricSwitch: {
    display: 'flex' as const, background: 'var(--color-bg)', borderRadius: 10, padding: 3,
    border: '1px solid var(--color-border)', marginBottom: 14, gap: 2,
  },
  metricSwitchBtn: (active: boolean, colorVar: string): React.CSSProperties => ({
    flex: 1, padding: '7px 4px', border: 'none', borderRadius: 8,
    background: active ? colorVar : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    fontWeight: active ? 700 : 600, fontSize: 12.5, cursor: 'pointer',
    transition: 'all 0.2s', whiteSpace: 'nowrap' as const,
  }),

  // Section B — "Ombordagi holat": outline treatment (fill-vs-outline is
  // the realized-vs-potential encoding, not a new hue).
  outlineGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  outlineCard: { padding: 14, borderRadius: 12, border: '1px solid var(--color-border)', background: 'transparent' },
  outlineCardLabelRow: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 6, marginBottom: 6 },
  outlineCardLabel: { fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500, margin: 0 },
  outlineCardValue: { fontSize: 18, fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' as const, letterSpacing: -0.2, margin: 0 },
  estimatedTag: {
    fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4,
    color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 5,
    padding: '2px 6px', flexShrink: 0,
  },

  detailGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 } as React.CSSProperties,
  detailItem: { padding: 12, borderRadius: 10, background: 'rgba(127,127,127,0.06)', border: '1px solid var(--color-border)' },
  detailItemLabel: { fontSize: 11, color: 'var(--color-text-secondary)', margin: 0, marginBottom: 3 },
  detailItemValue: (highlight?: boolean): React.CSSProperties => ({
    fontSize: 16, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums',
    color: highlight ? 'var(--color-primary)' : 'var(--color-text)',
  }),
  rankItem: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 12,
    padding: '11px 0',
  },
  rankBadge: (isBlacklist: boolean, index: number): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 15, display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    background: isBlacklist ? 'rgba(239,68,68,0.13)' : index < 3 ? 'var(--color-primary)' : 'var(--color-border)',
    color: (isBlacklist || index < 3) ? '#fff' : 'var(--color-text-secondary)',
    fontSize: 12, fontWeight: 700,
  }),
  rankNameRow: { display: 'flex' as const, justifyContent: 'space-between' as const, gap: 8, alignItems: 'center' as const },
  rankInfo: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  rankMetrics: { display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: 2 },
  rankSub: { fontSize: 12, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' as const },
  rankProfit: (isBlacklist: boolean, sold: number, profit: number): React.CSSProperties => ({
    display: 'flex' as const, alignItems: 'center' as const, gap: 3,
    fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const,
    color: profit < 0 ? 'var(--color-danger)' : sold <= 0 ? 'var(--color-text-tertiary)' : isBlacklist ? 'var(--color-warning)' : 'var(--color-primary)',
  }),
  rankBarTrack: { height: 4, borderRadius: 2, background: 'var(--color-border)', marginTop: 6, overflow: 'hidden' as const },
  // Sold-ratio fill now consistently uses the "Sotilgan dona" identity
  // color everywhere on this screen (was plain primary-purple before).
  rankBarFill: (ratio: number): React.CSSProperties => ({
    width: `${ratio * 100}%`, height: '100%', borderRadius: 2,
    background: 'var(--color-metric-qty)',
    transition: 'width 0.4s ease',
  }),
  dateNav: {
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    gap: 12, marginTop: 0, marginBottom: 12, padding: '8px 12px',
    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', borderRadius: 12,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.15)', color: '#fff',
    fontWeight: 700, fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.2s',
  },
  dateLabel: { flex: 1, textAlign: 'center' as const, cursor: 'pointer', padding: '4px 0' },
  dateLabelText: { fontSize: 15, fontWeight: 700, color: '#fff' },
  dateHintText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  spinnerWrap: { display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 60, gap: 12 },
  statItem: { width: '50%', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, margin: 0, marginBottom: 12 },
  cardSubtitle: { fontSize: 11, color: 'var(--color-text-secondary)', marginTop: -8, marginBottom: 12 },
  cardBlacklist: { ...CARD, borderColor: 'rgba(239,68,68,0.33)', background: 'rgba(239,68,68,0.03)' },
  noDataText: { fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' as const, padding: '12px 0', margin: 0 },
  showMoreBtn: {
    marginTop: 12, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(139,92,246,0.19)',
    background: 'transparent', color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%',
  },
  overlay: {
    position: 'fixed' as const, inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.6)', display: 'flex' as const,
    alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24,
  },
  modal: {
    width: '100%' as const, maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' as const,
    background: 'var(--color-surface)', borderRadius: 16, border: '1px solid var(--color-border)',
  },
  modalHeader: {
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
  },
  modalTitle: { fontSize: 16, fontWeight: 700, margin: 0 },
  modalClose: {
    width: 32, height: 32, borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  allTimeRangeRow: { display: 'flex' as const, gap: 10, padding: 20, paddingBottom: 10 },
  rangeBtn: {
    flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', cursor: 'pointer', textAlign: 'left' as const,
  },
  rangeBtnLabel: { fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 },
  rangeBtnValue: { fontSize: 14, fontWeight: 700, color: 'var(--color-text)' },
  applyBtn: {
    display: 'block' as const, margin: '0 20px 12px', padding: '12px 0', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: 'calc(100% - 40px)',
  },
  statsGrid: { display: 'flex' as const, flexWrap: 'wrap' as const } as React.CSSProperties,

  // Error banner — mirrors AppLayout's global error-banner treatment
  // (AlertTriangle + danger-soft background) so this screen's error state
  // reads consistently with the rest of the app instead of inventing a
  // new visual language.
  errorBanner: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 12, padding: '16px 18px',
    borderRadius: 14, background: 'var(--color-danger-soft)', border: '1px solid rgba(239,68,68,0.25)',
    marginBottom: 16,
  },
  errorBannerText: { flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)', margin: 0 },
  errorBannerRetryBtn: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 6, padding: '8px 14px', borderRadius: 9,
    border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    flexShrink: 0,
  },

  // Loading skeleton — plausible content-shaped placeholders using the
  // globally-defined `pulse` keyframe (no bare spinner for this screen).
  skeletonBlock: (h: number, delay = 0): React.CSSProperties => ({
    height: h, borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${delay}s`,
  }),
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={s.errorBanner} role="alert">
      <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
      <p style={s.errorBannerText}>{t('statsErrorTitle') || "Ma'lumotlarni yuklab bo'lmadi"}</p>
      <button style={s.errorBannerRetryBtn} onClick={onRetry}>
        <RefreshCw size={13} />
        {t('retryLabel') || 'Qayta urinish'}
      </button>
    </div>
  )
}

function StatisticsSkeleton() {
  return (
    <div>
      <div style={{ ...s.skeletonBlock(150), marginBottom: 14 }} />
      <div style={{ ...s.skeletonBlock(200, 0.08), marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[0, 1, 2].map((i) => <div key={i} style={s.skeletonBlock(66, 0.1 + i * 0.05)} />)}
      </div>
      <div style={{ ...s.skeletonBlock(120, 0.2) }} />
    </div>
  )
}

function MetricSwitch({ value, onChange }: { value: ChartMetric; onChange: (m: ChartMetric) => void }) {
  return (
    <div style={s.metricSwitch}>
      {METRIC_OPTIONS.map((opt) => (
        <button key={opt.key} onClick={() => onChange(opt.key)} style={s.metricSwitchBtn(value === opt.key, opt.colorVar)}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SectionEyebrow({ children, subtitle, first }: { children: React.ReactNode; subtitle?: string; first?: boolean }) {
  return (
    <div>
      <div style={s.sectionEyebrow(first)}>{children}</div>
      {subtitle && <div style={s.sectionSubtitle}>{subtitle}</div>}
    </div>
  )
}

interface Totals {
  sellableItems: number
  soldItems: number
  sellableValue: number
  earnedRevenue: number
  possibleProfit: number
  earnedProfit: number
  remainingItems: number
  stockValue: number
}

function buildTotals(summary: InventorySummary | null, items: any[]): Totals {
  if (summary) {
    return {
      sellableItems: summary.totalSold + summary.totalCurrent,
      soldItems: summary.totalSold,
      sellableValue: summary.totalRevenue + summary.totalStockSellValue,
      earnedRevenue: summary.totalRevenue,
      possibleProfit: summary.totalProfit + summary.totalStockProfit,
      earnedProfit: summary.totalProfit,
      remainingItems: summary.totalCurrent,
      stockValue: summary.totalStockSellValue,
    }
  }
  // Flow metrics (sold/revenue/profit) are correctly summed across every
  // day-entry in the range.
  let sold = 0, revenue = 0, profit = 0
  for (const item of items) {
    const qty = item.currentQuantity ?? 0
    const p = item.product
    const sellPrice = resolveSellPrice(item, p)
    const buyPrice = resolveBuyPrice(item, p)
    const soldQty = item.sold ?? Math.max((item.startQuantity ?? item.openingQuantity ?? 0) - qty, 0)
    sold += soldQty
    revenue += soldQty * sellPrice
    profit += item.realizedProfit ?? (soldQty * (sellPrice - buyPrice))
  }

  // Stock metrics (remaining pieces/value) are a POINT-IN-TIME snapshot, not
  // a flow — a product's physical stock exists once, not once per day it
  // shows up in a wide date-range query. Summing `currentQuantity` across
  // every per-product-per-day row (the previous bug here, only reachable
  // when `summary` is unavailable) inflated these totals by roughly "days
  // in range" for any multi-day query. Take only each product's
  // most-recent entry in the range instead, mirroring the backend's
  // aggregateInventoryForRange (inventory.logic.ts).
  const latestByProduct = new Map<string, any>()
  for (const item of items) {
    const id = item.product?._id || item.product?.id || item.productId
    if (!id) continue
    const existing = latestByProduct.get(id)
    if (!existing || (item.date ?? '') >= (existing.date ?? '')) {
      latestByProduct.set(id, item)
    }
  }
  let remaining = 0, stockSellValue = 0, stockProfit = 0
  for (const item of latestByProduct.values()) {
    const qty = Math.max(item.currentQuantity ?? 0, 0)
    const p = item.product
    const sellPrice = resolveSellPrice(item, p)
    const buyPrice = resolveBuyPrice(item, p)
    remaining += qty
    stockSellValue += qty * sellPrice
    stockProfit += qty * (sellPrice - buyPrice)
  }

  return {
    sellableItems: sold + remaining,
    soldItems: sold,
    sellableValue: revenue + stockSellValue,
    earnedRevenue: revenue,
    possibleProfit: profit + stockProfit,
    earnedProfit: profit,
    remainingItems: remaining,
    stockValue: stockSellValue,
  }
}

const RangeButton = forwardRef<HTMLDivElement, { value?: string; onClick?: () => void; label: string }>(({ value, onClick, label }, ref) => (
  <div ref={ref} onClick={onClick} style={s.rangeBtn}>
    <div style={s.rangeBtnLabel}>{label}</div>
    <div style={{ ...s.rangeBtnValue, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
))

export function StatisticsScreen() {
  const [period, setPeriod] = useState<Period>('daily')
  const [selectedDate, setSelectedDate] = useState(getBusinessDate)
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [metric, setMetric] = useState<ChartMetric>('revenue')
  const [showAllTime, setShowAllTime] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerDate, setPickerDate] = useState(selectedDate)
  const [allTimeFrom, setAllTimeFrom] = useState(() => dayjs(getBusinessDate()).subtract(1, 'year').format('YYYY-MM-DD'))
  const [allTimeTo, setAllTimeTo] = useState(getBusinessDate)
  const [allTimeItems, setAllTimeItems] = useState<any[] | null>(null)
  const [allTimeSummary, setAllTimeSummary] = useState<InventorySummary | null>(null)
  const [allTimeLoading, setAllTimeLoading] = useState(false)
  const [allTimeError, setAllTimeError] = useState(false)

  // Chart data window — for monthly/yearly period tabs the already-fetched
  // `inventoryItems` range covers the whole month/year, so buckets are
  // derived from it directly. For the daily tab the main fetch only ever
  // covers the single selected day (no history to plot), so the chart
  // fetches its own light 7-day window via the same `inventoryApi.getByDate`
  // call already used elsewhere on this screen — no new endpoint, no change
  // to the offline sync/cache layer.
  const [chartWindowItems, setChartWindowItems] = useState<any[]>([])
  const [chartWindowLoading, setChartWindowLoading] = useState(false)

  const range = useMemo(() => getPeriodRange(period, selectedDate), [period, selectedDate])
  const periodLabel = useMemo(() => formatPeriodLabel(period, selectedDate), [period, selectedDate])
  const refreshKey = useAppStore((s) => s.refreshKey)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const invRes = await inventoryApi.getByDate(range.from, range.to)
      setInventoryItems(invRes.data?.items ?? [])
      setSummary(invRes.data?.summary ?? null)
    } catch {
      setInventoryItems([])
      setSummary(null)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const chartWindowRange = useMemo(() => {
    if (period !== 'daily') return null
    return { from: dayjs(selectedDate).subtract(6, 'day').format('YYYY-MM-DD'), to: selectedDate }
  }, [period, selectedDate])

  const fetchChartWindow = useCallback(async () => {
    if (!chartWindowRange) {
      setChartWindowItems([])
      return
    }
    setChartWindowLoading(true)
    try {
      const res = await inventoryApi.getByDate(chartWindowRange.from, chartWindowRange.to)
      setChartWindowItems(res.data?.items ?? [])
    } catch {
      setChartWindowItems([])
    } finally {
      setChartWindowLoading(false)
    }
  }, [chartWindowRange?.from, chartWindowRange?.to])

  useEffect(() => {
    fetchChartWindow()
  }, [fetchChartWindow, refreshKey])

  const chartBuckets = useMemo<ChartBucket[]>(() => {
    if (period === 'daily') {
      if (!chartWindowRange) return []
      const days = enumerateDays(chartWindowRange.from, chartWindowRange.to)
      return buildDayBuckets(chartWindowItems, days, selectedDate)
    }
    if (period === 'monthly') {
      const days = enumerateDays(range.from, range.to)
      return buildDayBuckets(inventoryItems, days, selectedDate)
    }
    const months = enumerateMonths(range.from, range.to)
    return buildMonthBuckets(inventoryItems, months, dayjs(selectedDate).format('YYYY-MM'))
  }, [period, selectedDate, range.from, range.to, inventoryItems, chartWindowItems, chartWindowRange])

  const chartIsLoading = period === 'daily' ? chartWindowLoading : loading

  const overallTotals = useMemo(() => {
    if (inventoryItems.length > 0) return buildTotals(summary, inventoryItems)
    return null
  }, [inventoryItems, summary])

  const totals = useMemo(() => {
    if (summary) {
      return { revenue: summary.totalRevenue, profit: summary.totalProfit, sold: summary.totalSold }
    }
    const revenue = inventoryItems.reduce((s, item) => {
      const sellPrice = resolveSellPrice(item, item.product)
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const soldQty = item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0)
      return s + soldQty * sellPrice
    }, 0)
    const profit = inventoryItems.reduce((s, item) => {
      const sellPrice = resolveSellPrice(item, item.product)
      const buyPrice = resolveBuyPrice(item, item.product)
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const soldQty = item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0)
      return s + (item.realizedProfit ?? (soldQty * (sellPrice - buyPrice)))
    }, 0)
    const sold = inventoryItems.reduce((s, item) => {
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      return s + (item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0))
    }, 0)
    return { revenue, profit, sold }
  }, [inventoryItems, summary])

  const margin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0

  const allProductStats = useMemo(() => buildProductRankings(inventoryItems), [inventoryItems])

  const topProducts = useMemo(() =>
    allProductStats.filter((p) => p.sold > 0).sort((a, b) => b.sold - a.sold || b.profit - a.profit),
  [allProductStats])

  const leastProducts = useMemo(() =>
    [...allProductStats].sort((a, b) => a.sold - b.sold || a.profit - b.profit),
  [allProductStats])

  const allTimeTotals = useMemo(() => {
    if (!allTimeItems) return null
    return buildTotals(allTimeSummary, allTimeItems)
  }, [allTimeItems, allTimeSummary])

  // Reuses the exact Section A chart component. Bucketed monthly when the
  // selected range spans more than 60 days, daily otherwise.
  const allTimeChartBuckets = useMemo<ChartBucket[]>(() => {
    if (!allTimeItems) return []
    const spanDays = dayjs(allTimeTo).diff(dayjs(allTimeFrom), 'day')
    if (spanDays > 60) {
      const months = enumerateMonths(allTimeFrom, allTimeTo)
      return buildMonthBuckets(allTimeItems, months, dayjs(getBusinessDate()).format('YYYY-MM'))
    }
    const days = enumerateDays(allTimeFrom, allTimeTo)
    return buildDayBuckets(allTimeItems, days, getBusinessDate())
  }, [allTimeItems, allTimeFrom, allTimeTo])

  const handlePrev = useCallback(() => setSelectedDate((d) => navigateDate(period, d, -1)), [period])
  const handleNext = useCallback(() => setSelectedDate((d) => navigateDate(period, d, 1)), [period])
  const handleRefresh = useCallback(() => { fetchData(); fetchChartWindow() }, [fetchData, fetchChartWindow])

  const handleDateLabelClick = () => {
    setPickerDate(selectedDate)
    setShowDatePicker(true)
  }

  const handleDownload = () => {
    if (!inventoryItems.length) return
    const rows = [['Mahsulot', 'Kelish', 'Sotish', 'Sotilgan', 'Tushum', 'Foyda']]
    for (const item of inventoryItems) {
      const p = item.product
      const name = p?.name || 'Noma\'lum'
      const buy = resolveBuyPrice(item, p)
      const sell = resolveSellPrice(item, p)
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const sold = item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0)
      const revenue = item.revenue ?? sold * sell
      const profit = item.realizedProfit ?? sold * (sell - buy)
      rows.push([name, String(buy), String(sell), String(sold), String(revenue), String(profit)])
    }
    const totals = buildTotals(summary, inventoryItems)
    rows.push(['Jami', '', '', String(totals.soldItems), String(totals.earnedRevenue), String(totals.earnedProfit)])

    // Escape embedded double quotes in every cell before wrapping it in
    // quotes — a product name/note containing a literal `"` would otherwise
    // break the CSV's column structure (backported from web's fix).
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hisobot-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fetchAllTime = useCallback(async (from: string, to: string) => {
    setAllTimeLoading(true)
    setAllTimeError(false)
    try {
      const invRes = await inventoryApi.getByDate(from, to)
      setAllTimeItems(invRes.data?.items ?? [])
      setAllTimeSummary(invRes.data?.summary ?? null)
    } catch {
      setAllTimeItems(null)
      setAllTimeSummary(null)
      setAllTimeError(true)
    } finally {
      setAllTimeLoading(false)
    }
  }, [])

  const handleOpenAllTime = useCallback(async () => {
    setShowAllTime(true)
    const from = dayjs(getBusinessDate()).subtract(5, 'year').format('YYYY-MM-DD')
    const to = getBusinessDate()
    setAllTimeFrom(from)
    setAllTimeTo(to)
    await fetchAllTime(from, to)
  }, [fetchAllTime])

  const handleAllTimeApply = useCallback(async () => {
    const a = dayjs(allTimeFrom)
    const b = dayjs(allTimeTo)
    const from = a.isBefore(b) || a.isSame(b, 'day') ? allTimeFrom : allTimeTo
    const to = a.isBefore(b) || a.isSame(b, 'day') ? allTimeTo : allTimeFrom
    await fetchAllTime(from, to)
  }, [allTimeFrom, allTimeTo, fetchAllTime])

  function renderRankItem(item: ProductRankItem, index: number, isBlacklist: boolean, maxSold = 1) {
    const unsold = item.sold <= 0
    const ratio = item.sold > 0 ? Math.min(item.sold / maxSold, 1) : 0
    const negative = item.profit < 0
    return (
      <div key={item.id} style={s.rankItem}>
        <div style={s.rankBadge(isBlacklist, index)}>
          {index + 1}
        </div>
        <div style={s.rankInfo}>
          <div style={s.rankNameRow}>
            <div style={s.rankName}>{item.name}</div>
            <span style={s.rankProfit(isBlacklist, item.sold, item.profit)}>
              {negative && <TrendingDown size={11} />}
              {formatMoney(item.profit)}
            </span>
          </div>
          <div style={s.rankMetrics}>
            <span style={{ ...s.rankSub, ...(unsold ? { color: 'var(--color-text-tertiary)' } : {}) } as React.CSSProperties}>
              {unsold ? t('notSoldInPeriod') || 'Sotilmagan' : `${item.sold} dona`}
            </span>
          </div>
          <div style={s.rankBarTrack}>
            <div style={s.rankBarFill(ratio)} />
          </div>
        </div>
      </div>
    )
  }

  function RankingCardComponent({ title, subtitle, items: rankItems, isBlacklist = false }: {
    title: string; subtitle?: string; items: ProductRankItem[]; isBlacklist?: boolean
  }) {
    const [showAll, setShowAll] = useState(false)
    const limit = 5
    const limited = rankItems.length > limit && !showAll
    const displayItems = limited ? rankItems.slice(0, limit) : rankItems
    const maxSold = Math.max(...rankItems.map((i) => i.sold), 1)

    return (
      <div style={isBlacklist ? s.cardBlacklist : CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {isBlacklist ? <TrendingDown size={18} color="var(--color-danger)" /> : <TrendingUp size={18} color="var(--color-success)" />}
          <h3 style={s.cardTitle}>{title}</h3>
        </div>
        {subtitle ? <p style={s.cardSubtitle}>{subtitle}</p> : null}
        {displayItems.length > 0 ? (
          displayItems.map((item, i) => renderRankItem(item, i, isBlacklist, maxSold))
        ) : (
          <p style={s.noDataText}>{t('noProductsPeriod') || 'Bu davrda mahsulot yo\'q'}</p>
        )}
        {(limited || showAll) && (
          <button style={s.showMoreBtn} onClick={() => setShowAll(!showAll)}>
            {showAll ? (t('showLess') || 'Yashirish') : (t('more') || 'Ko\'proq')}
          </button>
        )}
      </div>
    )
  }

  const negativeNetProfit = totals.profit < 0

  return (
    <div style={s.container}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.pageTitle}>{t('statistics')}</h2>
          <p style={s.pageSubtitle}>{periodLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDownload} style={s.secondaryBtn}>
            <Download size={16} />
            {t('downloadStatistics') || 'Yuklab olish'}
          </button>
          <button onClick={handleOpenAllTime} style={s.primaryBtn}>
            <CalendarClock size={16} />
            {t('allTimeStatistics') || 'Barcha vaqt'}
          </button>
        </div>
      </div>

      {/* Section A — "Bu davr" (period tabs + date nav — interaction model unchanged) */}
      <SectionEyebrow first>{t('statsSectionThisPeriod') || 'Bu davr'}</SectionEyebrow>

      <div style={s.tabsRow}>
        <div style={s.periodTabs}>
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={s.periodTab(period === p)}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <button onClick={handleRefresh} style={{ ...s.refreshBtn, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={17} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      <div style={s.dateNav}>
        <button onClick={handlePrev} style={s.navBtn}><ChevronLeft size={18} /></button>
        <div style={s.dateLabel} onClick={handleDateLabelClick}>
          <div style={s.dateLabelText}>{periodLabel}</div>
          {range.from !== range.to && (
            <div style={s.dateHintText}>
              {dayjs(range.from).format('DD.MM')} - {dayjs(range.to).format('DD.MM.YYYY')}
            </div>
          )}
        </div>
        <button onClick={handleNext} style={s.navBtn}><ChevronRight size={18} /></button>
      </div>

      {/* Loading skeleton (no bare spinner) */}
      {loading && <StatisticsSkeleton />}

      {/* Error state — distinct from "genuinely empty" */}
      {!loading && fetchError && <ErrorBanner onRetry={fetchData} />}

      {/* Content */}
      {!loading && !fetchError && (
        <>
          {/* Hero — Tushum (revenue), realized, full precision */}
          <div style={s.hero}>
            <div style={s.heroCircle1} />
            <div style={s.heroCircle2} />
            <div style={s.heroLabel}><Wallet size={15} /> {t('totalRevenue') || 'Jami tushum'}</div>
            <div style={s.heroValue}>{formatMoney(totals.revenue)}</div>
            <div style={s.heroChips}>
              <span style={s.heroChip}>{t('soldPieces') || 'Sotilgan dona'}: {totals.sold}</span>
              <span style={s.heroChip}>{t('marginPercent') || 'Marja foizi'}: {margin}%</span>
            </div>
          </div>

          {/* Trend chart — directly below the hero, single metric at a time */}
          <div style={{ ...s.chartCard, marginBottom: 16 }}>
            <MetricSwitch value={metric} onChange={setMetric} />
            <StatBarChart buckets={chartBuckets} metric={metric} loading={chartIsLoading} emptyText={t('chartNoData') || "Bu davr uchun ma'lumot yo'q"} height={140} />
          </div>

          {/* KPI cards — realized-period breakdown */}
          <div style={s.kpiGrid}>
            {[
              {
                icon: negativeNetProfit ? <TrendingDown size={18} /> : <TrendingUp size={18} />,
                label: t('netProfit') || 'Sof foyda',
                value: formatMoney(totals.profit),
                color: negativeNetProfit ? 'var(--color-danger)' : 'var(--color-metric-profit)',
                bg: negativeNetProfit ? 'var(--color-danger-soft)' : 'var(--color-metric-profit-soft)',
                negative: negativeNetProfit,
              },
              { icon: <ShoppingCart size={18} />, label: t('soldPieces') || 'Sotilgan dona', value: String(totals.sold), color: 'var(--color-metric-qty)', bg: 'var(--color-metric-qty-soft)', negative: false },
              { icon: <Percent size={18} />, label: t('marginPercent') || 'Marja foizi', value: `${margin}%`, color: 'var(--color-violet)', bg: 'var(--color-violet-soft)', negative: false },
            ].map((item, i) => (
              <div key={i} style={s.kpiCard}>
                <div style={{ ...s.kpiIcon, background: item.bg, color: item.color }}>{item.icon}</div>
                <div>
                  <div style={s.kpiLabel}>{item.label}</div>
                  <div style={{ ...s.kpiValue, color: item.negative ? item.color : 'var(--color-text)' }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Section B — "Ombordagi holat" (stock-at-rest, projected — outline treatment) */}
          {overallTotals && (
            <>
              <SectionEyebrow subtitle={t('statsSectionInventorySubtitle') || 'Agar barcha qoldiq sotilsa'}>
                {t('statsSectionInventory') || 'Ombordagi holat'}
              </SectionEyebrow>
              <div style={s.outlineGrid}>
                {[
                  { label: t('remainingPieces'), value: String(overallTotals.remainingItems) },
                  { label: t('remainingStockValue'), value: formatMoney(overallTotals.stockValue) },
                  { label: t('potentialProfit'), value: formatMoney(overallTotals.possibleProfit) },
                ].map((item, i) => (
                  <div key={i} style={s.outlineCard}>
                    <div style={s.outlineCardLabelRow}>
                      <p style={s.outlineCardLabel}>{item.label}</p>
                      <span style={s.estimatedTag}>{t('estimatedTag') || 'taxminiy'}</span>
                    </div>
                    <p style={s.outlineCardValue}>{item.value}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Full breakdown — all 8 numbers together in one sequential card,
              in addition to the KPI row / Section B split above. Reuses the
              same (now-fixed) overallTotals values, so this is purely an
              additive presentation, not a second data source. */}
          {overallTotals && (
            <>
              <SectionEyebrow subtitle={t('statsSectionFullBreakdownSubtitle') || 'Barcha ko\'rsatkichlar bitta joyda'}>
                {t('statsSectionFullBreakdown') || 'To\'liq statistika'}
              </SectionEyebrow>
              <div style={{ ...s.chartCard, marginBottom: 16 }}>
                <div style={s.statsGrid}>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('totalSellablePieces')}</p>
                    <p style={STAT_VALUE}>{overallTotals.sellableItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('soldPieces') || 'Sotilgan dona'}</p>
                    <p style={STAT_VALUE}>{overallTotals.soldItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('totalSellValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(overallTotals.sellableValue)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('soldValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(overallTotals.earnedRevenue)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('potentialProfit')}</p>
                    <p style={{ ...STAT_VALUE, color: 'var(--color-primary)' }}>{formatMoney(overallTotals.possibleProfit)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('earnedProfit')}</p>
                    <p style={{ ...STAT_VALUE, color: 'var(--color-primary)' }}>{formatMoney(overallTotals.earnedProfit)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('remainingPieces')}</p>
                    <p style={STAT_VALUE}>{overallTotals.remainingItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('remainingStockValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(overallTotals.stockValue)}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Section C — Rankings */}
          <SectionEyebrow>{t('statsSectionRankings') || 'Reyting'}</SectionEyebrow>

          <RankingCardComponent
            title={t('topProductsLabel') || 'Top mahsulotlar'}
            items={topProducts}
          />

          {leastProducts.length > 0 && (
            <RankingCardComponent
              title={t('leastSold') || 'Kam sotilgan'}
              subtitle={t('blackListSubtitle') || 'Qora ro\'yxat'}
              items={leastProducts}
              isBlacklist
            />
          )}
        </>
      )}

      {/* DatePicker overlay */}
      {showDatePicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setShowDatePicker(false)}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} onClick={(e) => e.stopPropagation()}>
            <DatePicker
              inline
              selected={dayjs(pickerDate).toDate()}
              {...(period === 'monthly' ? { showMonthYearPicker: true } : {})}
              {...(period === 'yearly' ? { showYearPicker: true } : {})}
              onChange={(date: Date | null) => {
                if (date) {
                  const d = dayjs(date)
                  let formatted: string
                  if (period === 'monthly') formatted = d.startOf('month').format('YYYY-MM-DD')
                  else if (period === 'yearly') formatted = d.startOf('year').format('YYYY-MM-DD')
                  else formatted = d.format('YYYY-MM-DD')
                  setPickerDate(formatted)
                  setSelectedDate(formatted)
                  setShowDatePicker(false)
                }
              }}
            />
          </div>
        </div>
      )}

      {/* All Time Modal */}
      {showAllTime && (
        <div style={s.overlay} onClick={() => setShowAllTime(false)}>
          <div style={{ ...s.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{t('allTimeStatisticsTitle')}</h3>
              <button style={s.modalClose} onClick={() => setShowAllTime(false)}><X size={18} /></button>
            </div>

            {/* Date Range */}
            <div style={s.allTimeRangeRow}>
              <DatePicker
                selected={dayjs(allTimeFrom).toDate()}
                onChange={(date: Date | null) => { if (date) setAllTimeFrom(dayjs(date).format('YYYY-MM-DD')) }}
                dateFormat="DD.MM.YYYY"
                customInput={<RangeButton label={t('rangeFrom')} />}
              />
              <DatePicker
                selected={dayjs(allTimeTo).toDate()}
                onChange={(date: Date | null) => { if (date) setAllTimeTo(dayjs(date).format('YYYY-MM-DD')) }}
                dateFormat="DD.MM.YYYY"
                customInput={<RangeButton label={t('rangeTo')} />}
              />
            </div>

            <button style={s.applyBtn} onClick={handleAllTimeApply} disabled={allTimeLoading}>
              {allTimeLoading ? (t('loading_data') || 'Yuklanmoqda...') : (t('applyRange'))}
            </button>

            {allTimeLoading ? (
              <div style={{ padding: '0 20px 20px' }}>
                <div style={{ ...s.chartCard, marginBottom: 12 }}>
                  <StatBarChart buckets={[]} metric={metric} loading emptyText="" height={110} />
                </div>
                <div style={s.spinnerWrap}>
                  <div style={spinner(32)} />
                </div>
              </div>
            ) : allTimeError ? (
              <div style={{ padding: '0 20px 20px' }}>
                <ErrorBanner onRetry={() => fetchAllTime(allTimeFrom, allTimeTo)} />
              </div>
            ) : allTimeTotals ? (
              <div style={{ padding: 20, paddingTop: 0 }}>
                {/* Trend chart — reuses the exact Section A chart component,
                    bucketed by month (>60 day range) or day (<=60 days). */}
                <div style={{ ...s.chartCard, marginBottom: 16 }}>
                  <MetricSwitch value={metric} onChange={setMetric} />
                  <StatBarChart buckets={allTimeChartBuckets} metric={metric} height={110} emptyText={t('chartNoData') || "Bu davr uchun ma'lumot yo'q"} />
                </div>
                <div style={s.statsGrid}>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('totalSellablePieces')}</p>
                    <p style={STAT_VALUE}>{allTimeTotals.sellableItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('soldPieces') || 'Sotilgan dona'}</p>
                    <p style={STAT_VALUE}>{allTimeTotals.soldItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('totalSellValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(allTimeTotals.sellableValue)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('soldValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(allTimeTotals.earnedRevenue)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('potentialProfit')}</p>
                    <p style={{ ...STAT_VALUE, color: 'var(--color-primary)' }}>{formatMoney(allTimeTotals.possibleProfit)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('earnedProfit')}</p>
                    <p style={{ ...STAT_VALUE, color: 'var(--color-primary)' }}>{formatMoney(allTimeTotals.earnedProfit)}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('remainingPieces')}</p>
                    <p style={STAT_VALUE}>{allTimeTotals.remainingItems}</p>
                  </div>
                  <div style={s.statItem}>
                    <p style={STAT_LABEL}>{t('remainingStockValue')}</p>
                    <p style={STAT_VALUE}>{formatMoney(allTimeTotals.stockValue)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={s.spinnerWrap}>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{t('noData') || 'Ma\'lumot yo\'q'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
