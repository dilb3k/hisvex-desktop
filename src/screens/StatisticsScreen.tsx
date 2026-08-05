import { useEffect, useState, useMemo, useCallback, forwardRef } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { inventoryApi } from '../api/client'
import { useAppStore } from '../store/appStore'
import dayjs from 'dayjs'
import { Download, CalendarClock, RefreshCw, TrendingUp, TrendingDown, X, ChevronLeft, ChevronRight, Wallet, ShoppingCart, Percent, Package } from 'lucide-react'
import { t } from '../i18n'
import { getBusinessDate } from '../utils/businessDay'
import { formatMoney } from '../styles/shared'
import { resolveSellPrice, resolveBuyPrice } from '../utils/inventory'
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
  headerRow: { display: 'flex' as const, alignItems: 'center' as const, gap: 10, marginBottom: 16 },
  headerFlex: { flex: 1 },
  title: { fontSize: 0, margin: 0 } as React.CSSProperties,
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
  heroValue: { position: 'relative' as const, fontSize: 34, fontWeight: 800, color: '#fff', marginTop: 8, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' as const },
  heroChips: { position: 'relative' as const, display: 'flex' as const, gap: 8, marginTop: 14, flexWrap: 'wrap' as const },
  heroChip: { padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600 },
  kpiGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 },
  kpiCard: {
    background: 'var(--color-surface)', borderRadius: 14, padding: 16, border: '1px solid var(--color-border)',
    display: 'flex' as const, alignItems: 'center' as const, gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  kpiIcon: { width: 42, height: 42, borderRadius: 12, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, flexShrink: 0 },
  kpiLabel: { fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 },
  kpiValue: { fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: -0.3 },
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
  rankSub: { fontSize: 12, color: 'var(--color-text-secondary)' },
  rankProfit: (isBlacklist: boolean, sold: number, profit: number): React.CSSProperties => ({
    fontSize: 13, fontWeight: 700,
    color: profit < 0 ? 'var(--color-danger)' : sold <= 0 ? 'var(--color-text-tertiary)' : isBlacklist ? 'var(--color-warning)' : 'var(--color-primary)',
  }),
  rankBarTrack: { height: 4, borderRadius: 2, background: 'var(--color-border)', marginTop: 6, overflow: 'hidden' as const },
  rankBarFill: (ratio: number, isBlacklist: boolean): React.CSSProperties => ({
    width: `${ratio * 100}%`, height: '100%', borderRadius: 2,
    background: isBlacklist ? 'var(--color-danger)' : 'var(--color-primary)',
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
  toolbar: { display: 'flex' as const, gap: 10, marginBottom: 16 },
  toolbarBtn: {
    flex: 1, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.2s',
  },
  spinnerWrap: { display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 60, gap: 12 },
  spinner: { width: 36, height: 36, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  statItem: { width: '50%', marginBottom: 16 },
  statValueProfit: { ...STAT_VALUE, color: 'var(--color-primary)' },
  statValueSuccess: { ...STAT_VALUE, color: 'var(--color-success)' },
  statValueDanger: { ...STAT_VALUE, color: 'var(--color-danger)' },
  mainKPIContainer: { width: '100%' as const, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' },
  mainKPIValue: { fontSize: 30, fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: -0.5 },
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
  allTimeRangeRow: { display: 'flex' as const, gap: 10, padding: 20 },
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
  pickerModal: { padding: 20 },
  pickerTitle: { fontSize: 16, fontWeight: 700, textAlign: 'center' as const, marginBottom: 4 },
  pickerValue: { fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' as const, marginBottom: 16 },
  pickerActions: { display: 'flex' as const, justifyContent: 'flex-end' as const, gap: 8, marginTop: 16 },
  statsGrid: { display: 'flex' as const, flexWrap: 'wrap' as const } as React.CSSProperties,
}

function StatItem({ label, value, highlight, color }: { label: string; value: string | number; highlight?: boolean; color?: string }) {
  return (
    <div style={s.statItem}>
      <p style={STAT_LABEL}>{label}</p>
      <p style={{ ...STAT_VALUE, ...(highlight ? { color: 'var(--color-primary)' } : {}), ...(color ? { color } : {}) } as React.CSSProperties}>
        {value}
      </p>
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
  let sold = 0, revenue = 0, profit = 0, remaining = 0
  for (const item of items) {
    const qty = item.currentQuantity ?? 0
    const p = item.product
    const sellPrice = resolveSellPrice(item, p)
    const buyPrice = resolveBuyPrice(item, p)
    const soldQty = item.sold ?? Math.max((item.startQuantity ?? item.openingQuantity ?? 0) - qty, 0)
    sold += soldQty
    revenue += soldQty * sellPrice
    profit += item.realizedProfit ?? (soldQty * (sellPrice - buyPrice))
    remaining += Math.max(qty, 0)
  }
  const stockSellValue = items.reduce((s, item) => {
    const qty = item.currentQuantity ?? 0
    const p = item.product
    const sellPrice = resolveSellPrice(item, p)
    return s + Math.max(qty, 0) * sellPrice
  }, 0)
  const stockProfit = items.reduce((s, item) => {
    const qty = item.currentQuantity ?? 0
    const p = item.product
    const sellPrice = resolveSellPrice(item, p)
    const buyPrice = resolveBuyPrice(item, p)
    return s + Math.max(qty, 0) * (sellPrice - buyPrice)
  }, 0)
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
    <div style={s.rangeBtnValue}>{value}</div>
  </div>
))

export function StatisticsScreen() {
  const [period, setPeriod] = useState<Period>('daily')
  const [selectedDate, setSelectedDate] = useState(getBusinessDate)
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllTime, setShowAllTime] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerDate, setPickerDate] = useState(selectedDate)
  const [allTimeFrom, setAllTimeFrom] = useState(() => dayjs(getBusinessDate()).subtract(1, 'year').format('YYYY-MM-DD'))
  const [allTimeTo, setAllTimeTo] = useState(getBusinessDate)
  const [allTimeItems, setAllTimeItems] = useState<any[] | null>(null)
  const [allTimeSummary, setAllTimeSummary] = useState<InventorySummary | null>(null)
  const [allTimeLoading, setAllTimeLoading] = useState(false)

  const range = useMemo(() => getPeriodRange(period, selectedDate), [period, selectedDate])
  const periodLabel = useMemo(() => formatPeriodLabel(period, selectedDate), [period, selectedDate])
  const refreshKey = useAppStore((s) => s.refreshKey)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const invRes = await inventoryApi.getByDate(range.from, range.to)
      setInventoryItems(invRes.data?.items ?? [])
      setSummary(invRes.data?.summary ?? null)
    } catch {
      setInventoryItems([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  const handlePrev = useCallback(() => setSelectedDate((d) => navigateDate(period, d, -1)), [period])
  const handleNext = useCallback(() => setSelectedDate((d) => navigateDate(period, d, 1)), [period])
  const handleRefresh = useCallback(() => fetchData(), [fetchData])

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

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hisobot-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fetchAllTime = useCallback(async (from: string, to: string) => {
    setAllTimeLoading(true)
    try {
      const invRes = await inventoryApi.getByDate(from, to)
      setAllTimeItems(invRes.data?.items ?? [])
      setAllTimeSummary(invRes.data?.summary ?? null)
    } catch {
      setAllTimeItems(null)
      setAllTimeSummary(null)
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
    return (
      <div key={item.id} style={s.rankItem}>
        <div style={s.rankBadge(isBlacklist, index)}>
          {index + 1}
        </div>
        <div style={s.rankInfo}>
          <div style={s.rankNameRow}>
            <div style={s.rankName}>{item.name}</div>
            <span style={s.rankProfit(isBlacklist, item.sold, item.profit)}>{formatMoney(item.profit)}</span>
          </div>
          <div style={s.rankMetrics}>
            <span style={{ ...s.rankSub, ...(unsold ? { color: 'var(--color-text-tertiary)' } : {}) } as React.CSSProperties}>
              {unsold ? t('notSoldInPeriod') || 'Sotilmagan' : `${item.sold} dona`}
            </span>
          </div>
          <div style={s.rankBarTrack}>
            <div style={s.rankBarFill(ratio, isBlacklist)} />
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

      {/* Period tabs + refresh */}
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

      {/* Date Navigation */}
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

      {/* Loading */}
      {loading && (
        <div style={s.spinnerWrap}>
          <div style={s.spinner} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('loading_data') || 'Yuklanmoqda...'}</span>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* Hero */}
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

          {/* KPI cards */}
          <div style={s.kpiGrid}>
            {[
              { icon: <TrendingUp size={18} />, label: t('netProfit') || 'Sof foyda', value: formatMoney(totals.profit), color: 'var(--color-primary)' },
              { icon: <ShoppingCart size={18} />, label: t('soldPieces') || 'Sotilgan dona', value: String(totals.sold), color: 'var(--color-success)' },
              { icon: <Percent size={18} />, label: t('marginPercent') || 'Marja foizi', value: `${margin}%`, color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} style={s.kpiCard}>
                <div style={{ ...s.kpiIcon, background: `${item.color}1a`, color: item.color }}>{item.icon}</div>
                <div>
                  <div style={s.kpiLabel}>{item.label}</div>
                  <div style={s.kpiValue}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* OverallRangeCard */}
          {overallTotals && (
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Package size={17} color="var(--color-primary)" />
                <p style={{ ...STAT_LABEL, fontSize: 13, margin: 0 }}>{periodLabel} - {t('totalRevenueLabel') || 'Umumiy'}</p>
              </div>
              <div style={s.detailGrid}>
                {[
                  { label: t('totalSellablePieces'), value: overallTotals.sellableItems },
                  { label: t('soldPieces') || 'Sotilgan dona', value: overallTotals.soldItems },
                  { label: t('totalSellValue'), value: formatMoney(overallTotals.sellableValue) },
                  { label: t('soldValue'), value: formatMoney(overallTotals.earnedRevenue) },
                  { label: t('potentialProfit'), value: formatMoney(overallTotals.possibleProfit), highlight: true },
                  { label: t('earnedProfit'), value: formatMoney(overallTotals.earnedProfit), highlight: true },
                  { label: t('remainingPieces'), value: overallTotals.remainingItems },
                  { label: t('remainingStockValue'), value: formatMoney(overallTotals.stockValue) },
                ].map((item, i) => (
                  <div key={i} style={s.detailItem}>
                    <p style={s.detailItemLabel}>{item.label}</p>
                    <p style={s.detailItemValue(!!item.highlight)}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Products */}
          <RankingCardComponent
            title={t('topProductsLabel') || 'Top mahsulotlar'}
            items={topProducts}
          />

          {/* Least Sold */}
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
              <div style={s.spinnerWrap}>
                <div style={s.spinner} />
              </div>
            ) : allTimeTotals ? (
              <div style={{ padding: 20, paddingTop: 0 }}>
                <div style={s.statsGrid}>
                  <StatItem label={t('totalSellablePieces')} value={allTimeTotals.sellableItems} />
                  <StatItem label={t('soldPieces') || 'Sotilgan dona'} value={allTimeTotals.soldItems} />
                  <StatItem label={t('totalSellValue')} value={formatMoney(allTimeTotals.sellableValue)} />
                  <StatItem label={t('soldValue')} value={formatMoney(allTimeTotals.earnedRevenue)} />
                  <StatItem label={t('potentialProfit')} value={formatMoney(allTimeTotals.possibleProfit)} highlight />
                  <StatItem label={t('earnedProfit')} value={formatMoney(allTimeTotals.earnedProfit)} highlight />
                  <StatItem label={t('remainingPieces')} value={allTimeTotals.remainingItems} />
                  <StatItem label={t('remainingStockValue')} value={formatMoney(allTimeTotals.stockValue)} />
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
