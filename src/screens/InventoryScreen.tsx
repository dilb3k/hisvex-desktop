import { useEffect, useState, useMemo, useCallback, forwardRef } from 'react'
import { inventoryApi, resolveImageUrl, clearApiCache, getDeviceId } from '../api/client'
import { useAppStore } from '../store/appStore'
import dayjs from 'dayjs'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  ChevronLeft, ChevronRight, Package, Search, Boxes, ShoppingCart, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { t } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import type { Product, InventoryItem } from '../types'
import { formatMoney, overlay } from '../styles/shared'
import { getBusinessDate } from '../utils/businessDay'
import { resolveSellPrice, resolveBuyPrice, clampCurrentQuantity } from '../utils/inventory'
import { isOnline, isNetworkError } from '../utils/network'
import { enqueue, getQueueSnapshot, subscribe as subscribeQueue } from '../store/offlineQueue'
import type { QueuedInventory } from '../store/offlineQueue'

const parseWholeNumber = (val: string) => Number(val.replace(/\D/g, '')) || 0

interface EnrichedItem {
  product: Product
  inv: InventoryItem | undefined
  opening: number
  current: number
  remaining: number
  sold: number
  revenue: number
  realizedProfit: number
  stockSellValue: number
  unitProfit: number
  sellPrice: number
  buyPrice: number
}

function getStockStatus(remaining: number) {
  if (remaining <= 0) return { label: 'Tugagan', color: 'var(--color-danger)', cls: 'badge badge-danger' }
  if (remaining <= 5) return { label: 'Kam', color: 'var(--color-warning)', cls: 'badge badge-warning' }
  return { label: 'Bor', color: 'var(--color-success)', cls: 'badge badge-success' }
}

const s: Record<string, React.CSSProperties> = {
  title: { fontSize: 24, fontWeight: 700 },
  dateNav: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' },
  dateNavBtn: { width: 36, height: 36, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  dateDisplay: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '4px 18px' },
  dateText: { fontSize: 16, fontWeight: 700, color: 'var(--color-text)', lineHeight: '22px' },
  weekdayText: { fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: '16px' },
  readOnlyBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)', fontSize: 12, fontWeight: 600, marginLeft: 8 },

  // KPI row — reuses the Statistics KPI-card visual pattern (icon chip +
  // label + tabular-nums value) instead of the old flat 4-cell text grid,
  // so this screen reads as the same app as the redesigned Statistics
  // screen. Sotildi/Tushum/Foyda get the same metric-identity colors
  // Statistics uses; Boshlang'ich/Qoldiq stay neutral ink.
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 8 },
  kpiCard: {
    background: 'var(--color-surface)', borderRadius: 14, padding: 14, border: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  kpiIcon: { width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  kpiLabel: { fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 2 },
  kpiValue: { fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 },

  // Quiet equation caption — a single anchor sentence explaining how the
  // three core numbers relate, styled as muted helper text (not a card),
  // shown once near the top rather than repeated per row.
  equationCaption: { fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500, margin: '0 0 16px', textAlign: 'center' },

  card: { padding: 18, borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow 0.15s' },
  modal: { width: 440, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  modalPrice: { fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16 },
  fieldRow: { display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--color-border)' },
  fieldLabel: { fontSize: 14, color: 'var(--color-text-secondary)' },
  fieldValue: { fontSize: 14, fontWeight: 600 },
  modalInput: { width: 130, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, textAlign: 'right' },
  modalInputError: { width: 130, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-danger)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, textAlign: 'right', boxShadow: '0 0 0 3px var(--color-danger-soft)' },
  // Explains why "start" is read-only — mobile already has this hint,
  // ported here so desktop's modal doesn't leave the read-only field
  // unexplained.
  startHint: { fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '4px 0 0', lineHeight: 1.4 },
  qtyErrorText: { fontSize: 12.5, color: 'var(--color-danger)', fontWeight: 600, margin: '6px 0 0' },
  previewBox: { marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' },
  savedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'var(--color-success)', color: '#fff', fontSize: 12, fontWeight: 600, animation: 'fadeIn 0.2s ease' },
  spinnerWrap: { display: 'flex', justifyContent: 'center', padding: 80 },
  emptyWrap: { textAlign: 'center', padding: 60, color: 'var(--color-text-secondary)' },
  searchWrap: { position: 'relative', marginBottom: 12 },

  // Error banner — mirrors the Statistics screen's ErrorBanner treatment
  // (AlertTriangle + danger-soft background) so a genuine fetch failure
  // reads distinctly from "no inventory today" instead of both collapsing
  // into the same empty state.
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
    borderRadius: 14, background: 'var(--color-danger-soft)', border: '1px solid rgba(239,68,68,0.25)',
    marginBottom: 16,
  },
  errorBannerText: { flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)', margin: 0 },
  errorBannerRetryBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
    border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    flexShrink: 0,
  },

  // Loading skeleton — plausible content-shaped placeholders (KPI row +
  // caption + card list) using the globally-defined `pulse` keyframe,
  // replacing the old bare spinner.
  skeletonBlock: { borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', animation: 'pulse 1.4s ease-in-out infinite' },
}

function skeletonBlock(h: number, delay = 0): React.CSSProperties {
  return { ...s.skeletonBlock, height: h, animationDelay: `${delay}s` }
}

// Real-bug fix: this react-datepicker customInput used to be declared inline
// inside InventoryScreen's function body, so it got recreated (and
// remounted) on every render of the component — the exact bug already fixed
// on LoginScreen's business-day-hour picker (see its comment). Hoisted to
// module scope, same as StatisticsScreen's RangeButton, with the
// render-dependent weekday text passed in as a prop instead of read from a
// closure.
const DateInput = forwardRef<HTMLDivElement, { value?: string; onClick?: () => void; weekday?: string }>(({ value, onClick, weekday }, ref) => (
  <div ref={ref} onClick={onClick} style={s.dateDisplay}>
    <span style={s.dateText}>{value}</span>
    <span style={s.weekdayText}>{weekday}</span>
  </div>
))

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

function InventorySkeleton() {
  return (
    <div>
      <div style={s.kpiGrid}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={skeletonBlock(60, i * 0.04)} />)}
      </div>
      <div style={{ ...skeletonBlock(12, 0.24), width: 200, margin: '0 auto 18px' }} />
      <div style={{ ...skeletonBlock(44, 0.28), marginBottom: 12 }} />
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...skeletonBlock(108, 0.32 + i * 0.05), marginBottom: 8 }} />)}
    </div>
  )
}

export function InventoryScreen() {
  const showToast = useAppStore((s) => s.showToast)
  // Distinguishes "genuinely no products in the catalog yet" from "just no
  // inventory entries today" — mirrors mobile's already-correct Inventory
  // empty-state pattern (item 5 of the products redesign pass).
  const catalogIsEmpty = useAppStore((s) => s.products.length === 0)
  const [selectedDate, setSelectedDate] = useState(getBusinessDate)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedEntry, setSelectedEntry] = useState<EnrichedItem | null>(null)
  const [currentQtyInput, setCurrentQtyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Product ids whose current-quantity edit was applied optimistically and
  // queued for background sync (offline or a network failure mid-save).
  // Derived from the real offline queue via offlineQueue.subscribe() (same
  // pattern Sidebar.tsx uses for the global pending count) rather than
  // local-only state, so navigating away and back doesn't lose track of
  // items still actually queued.
  const [pendingOfflineIds, setPendingOfflineIds] = useState<Set<string>>(
    () => new Set(getQueueSnapshot().inventory.map((item) => item.productId))
  )

  useEffect(() => subscribeQueue(() => {
    setPendingOfflineIds(new Set(getQueueSnapshot().inventory.map((item) => item.productId)))
  }), [])

  const isPastDate = dayjs(selectedDate).isBefore(getBusinessDate(), 'day')
  const isFutureDate = dayjs(selectedDate).isAfter(getBusinessDate(), 'day')
  const isEditable = !isPastDate && !isFutureDate
  const refreshKey = useAppStore((s) => s.refreshKey)

  const fetchData = useCallback(async () => {
    if (isFutureDate) { setItems([]); setLoading(false); return }
    setLoading(true)
    setFetchError(false)
    try {
      const { data } = await inventoryApi.getByDate(selectedDate, selectedDate)
      setItems(data?.items ?? [])
    } catch {
      setItems([])
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, isFutureDate])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  const combinedData = useMemo(() => {
    const result: EnrichedItem[] = []
    for (const item of items) {
      const product = item.product
      if (!product) continue
      const sellPrice = resolveSellPrice(item, product)
      const buyPrice = resolveBuyPrice(item, product)
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const current = item.currentQuantity ?? 0
      const remaining = Math.max(current, 0)
      const sold = item.sold ?? Math.max(opening - current, 0)
      const revenue = item.revenue ?? (sold * sellPrice)
      const realizedProfit = item.realizedProfit ?? (sold * (sellPrice - buyPrice))
      const stockSellValue = remaining * sellPrice
      const unitProfit = sellPrice - buyPrice
      result.push({
        product: product as Product, inv: item,
        opening, current, remaining, sold, revenue, realizedProfit,
        stockSellValue, unitProfit, sellPrice, buyPrice,
      })
    }
    result.sort((a, b) => {
      const ia = a.product.displayIndex ?? 999
      const ib = b.product.displayIndex ?? 999
      return ia !== ib ? ia - ib : (a.product.name || '').localeCompare(b.product.name || '')
    })
    return result
  }, [items])

  const filteredItems = useMemo(() => {
    if (!search.trim()) return combinedData
    const q = search.toLowerCase()
    return combinedData.filter((e) => e.product.name.toLowerCase().includes(q))
  }, [combinedData, search])

  const totals = useMemo(() => {
    let start = 0, remaining = 0, sold = 0, revenue = 0, profit = 0
    for (const e of combinedData) {
      start += e.opening
      remaining += e.remaining
      sold += e.sold
      revenue += e.revenue
      profit += e.realizedProfit
    }
    return { start, remaining, sold, revenue, profit }
  }, [combinedData])

  const goToPrevDay = useCallback(() => setSelectedDate((prev) => dayjs(prev).subtract(1, 'day').format('YYYY-MM-DD')), [])
  const goToNextDay = useCallback(() => setSelectedDate((prev) => dayjs(prev).add(1, 'day').format('YYYY-MM-DD')), [])

  const openModal = (entry: EnrichedItem) => { setSelectedEntry(entry); setCurrentQtyInput(String(entry.current)); setSaved(false) }
  const closeModal = () => { setSelectedEntry(null); setCurrentQtyInput('') }

  // Applies the edited current-quantity to local state, matching the same
  // derived-field recompute (sold/revenue/realizedProfit) the online path
  // gets from a fresh server response — used both when saving offline and
  // when an online attempt just failed with a network error.
  //
  // Also the real guard against a bad "remaining" value ever landing in
  // local state: `clampCurrentQuantity` (mirrors mobile's
  // `clampCurrentQuantity(quantity, startQuantity)` formula exactly) is
  // applied here regardless of what the caller passed in, so even if the
  // modal's inline validation were somehow bypassed, the applied value can
  // never exceed the day's opening quantity or drop below zero.
  const applyQuantityLocally = useCallback((productId: string, newQty: number) => {
    setItems((prev) => prev.map((item) => {
      if (item.productId !== productId && item.product?._id !== productId) return item
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const safeQty = clampCurrentQuantity(newQty, opening)
      const newSold = Math.max(opening - safeQty, 0)
      const sp = resolveSellPrice(item, item.product)
      const bp = resolveBuyPrice(item, item.product)
      return {
        ...item,
        currentQuantity: safeQty,
        sold: newSold,
        revenue: newSold * sp,
        realizedProfit: newSold * (sp - bp),
      }
    }))
  }, [])

  // Queues the current-quantity edit for background sync instead of the
  // direct API call, same pattern as SalesScreen's recordSaleOffline: apply
  // optimistically, enqueue one pending inventory update, show a
  // non-error success toast. Deliberately not calling syncEngine.syncNow()
  // here — the background engine already syncs on reconnect and interval.
  const saveQuantityOffline = useCallback((productId: string, newQty: number) => {
    applyQuantityLocally(productId, newQty)

    const existing = selectedEntry?.inv
    if (existing) {
      const { product: _product, ...withoutProduct } = existing
      const queuedItem: QueuedInventory = {
        ...withoutProduct,
        currentQuantity: newQty,
        localId: existing._id,
        deviceId: getDeviceId(),
        updatedAt: new Date().toISOString(),
      }
      // enqueue() notifies offlineQueue subscribers synchronously, which
      // updates pendingOfflineIds above — no need to set it here too.
      enqueue('inventory', queuedItem)
    }

    setSaved(true)
    showToast(t('inventorySavedOffline'), 'success')
    setTimeout(() => closeModal(), 700)
  }, [applyQuantityLocally, selectedEntry, showToast])

  // Real-bug fix: entering a "remaining" quantity greater than the day's
  // opening quantity used to save silently (Math.max just floored the
  // derived "sold" at 0, hiding the problem). Now it's blocked inline
  // before save is ever attempted — mirrors mobile's
  // `cannotAddMoreThanSold` validation.
  const rawQtyInput = selectedEntry ? parseWholeNumber(currentQtyInput) : 0
  const isOverCount = !!selectedEntry && isEditable && !isPastDate && rawQtyInput > selectedEntry.opening

  const handleSave = async () => {
    if (!selectedEntry || !isEditable) return
    const rawQty = parseWholeNumber(currentQtyInput)
    // Block save outright when the typed value exceeds the opening
    // quantity — the inline error is already visible; this is the actual
    // gate that prevents the request from ever going out.
    if (rawQty > selectedEntry.opening) return
    // Defensive clamp at the persist point itself (matches mobile exactly),
    // even though rawQty is already guaranteed in-range by the guard above.
    const newQty = clampCurrentQuantity(rawQty, selectedEntry.opening)
    setSaving(true)
    try {
      const productId = selectedEntry.inv?.productId ?? selectedEntry.product._id

      if (!isOnline()) {
        saveQuantityOffline(productId, newQty)
        return
      }

      try {
        await inventoryApi.bulkUpdate([{ productId, currentQuantity: newQty }])
        applyQuantityLocally(productId, newQty)
        setSaved(true)
        clearApiCache()
        await useAppStore.getState().refreshAll()
        setTimeout(() => closeModal(), 700)
      } catch (err: unknown) {
        if (isNetworkError(err)) {
          saveQuantityOffline(productId, newQty)
          return
        }
        throw err
      }
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : t('error'), 'error') } finally { setSaving(false) }
  }

  const preview = useMemo(() => {
    if (!selectedEntry || !isEditable || isOverCount) return null
    const newCurrent = parseWholeNumber(currentQtyInput)
    const newSold = Math.max(selectedEntry.opening - newCurrent, 0)
    const newRevenue = newSold * selectedEntry.sellPrice
    const newProfit = newSold * (selectedEntry.sellPrice - selectedEntry.buyPrice)
    return { prevSold: selectedEntry.sold, newSold, newRevenue, newProfit }
  }, [selectedEntry, currentQtyInput, isEditable, isOverCount])

  const renderDateNav = () => (
    <div style={s.dateNav}>
      <button onClick={goToPrevDay} style={s.dateNavBtn} title="Oldingi kun" aria-label="Oldingi kun"><ChevronLeft size={18} /></button>
      <DatePicker
        selected={dayjs(selectedDate).toDate()}
        onChange={(date: Date | null) => { if (date) setSelectedDate(dayjs(date).format('YYYY-MM-DD')) }}
        dateFormat="DD MMM YYYY"
        customInput={<DateInput weekday={dayjs(selectedDate).format('dddd')} />}
      />
      <button onClick={goToNextDay} style={s.dateNavBtn} title="Keyingi kun" aria-label="Keyingi kun"><ChevronRight size={18} /></button>
    </div>
  )

  const renderKpiRow = () => {
    const negativeProfit = totals.profit < 0
    const kpiItems = [
      { icon: <Boxes size={17} />, label: t('start'), value: String(totals.start), color: 'var(--color-text)', bg: 'rgba(127,127,127,0.12)' },
      { icon: <Package size={17} />, label: t('remaining'), value: String(totals.remaining), color: 'var(--color-text)', bg: 'rgba(127,127,127,0.12)' },
      { icon: <ShoppingCart size={17} />, label: t('sold'), value: String(totals.sold), color: 'var(--color-metric-qty)', bg: 'var(--color-metric-qty-soft)' },
      { icon: <Wallet size={17} />, label: t('revenue'), value: formatMoney(totals.revenue), color: 'var(--color-metric-revenue)', bg: 'var(--color-metric-revenue-soft)' },
      {
        icon: negativeProfit ? <TrendingDown size={17} /> : <TrendingUp size={17} />,
        label: t('profit'),
        value: formatMoney(totals.profit),
        color: negativeProfit ? 'var(--color-danger)' : 'var(--color-metric-profit)',
        bg: negativeProfit ? 'var(--color-danger-soft)' : 'var(--color-metric-profit-soft)',
      },
    ]
    return (
      <>
        <div style={s.kpiGrid}>
          {kpiItems.map((item, i) => (
            <div key={i} style={s.kpiCard}>
              <div style={{ ...s.kpiIcon, background: item.bg, color: item.color }}>{item.icon}</div>
              <div>
                <div style={s.kpiLabel}>{item.label}</div>
                <div style={{ ...s.kpiValue, color: item.color }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
        {/* Quiet anchor sentence — states the relationship between the
            three core numbers once, instead of repeating it per row. */}
        <p style={s.equationCaption}>{t('inventoryEquationCaption')}</p>
      </>
    )
  }

  const renderCard = (entry: EnrichedItem) => {
    const status = getStockStatus(entry.remaining)
    const productId = entry.inv?.productId ?? entry.product._id
    const isPendingSync = pendingOfflineIds.has(productId)
    return (
      <div
        key={entry.product._id}
        style={s.card}
        onClick={() => openModal(entry)}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {(entry.product.image || entry.product.imageHash) ? (
              <img src={resolveImageUrl(entry.product.image, entry.product.imageHash)} alt={entry.product.name} style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
            ) : (
              <Package size={26} color="var(--color-text-tertiary)" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {entry.product.name}
              {isPendingSync && (
                <span title={t('pendingSync')} style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0,
                }} />
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{formatMoney(entry.sellPrice)}</div>
          </div>
          <span className={status.cls} style={{ gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 3, background: status.color }} />
            {status.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t('start')}</div><div style={{ fontSize: 15, fontWeight: 600 }}>{entry.opening}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t('remaining')}</div><div style={{ fontSize: 15, fontWeight: 600 }}>{entry.remaining}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t('sold')}</div><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-success)' }}>{entry.sold}</div></div>
        </div>
      </div>
    )
  }

  const renderModal = () => {
    if (!selectedEntry) return null
    const status = getStockStatus(selectedEntry.remaining)
    const p = preview
    return (
      <div style={overlay} onClick={closeModal}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {(selectedEntry.product.image || selectedEntry.product.imageHash) ? (
                <img src={resolveImageUrl(selectedEntry.product.image, selectedEntry.product.imageHash)} alt={selectedEntry.product.name} style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
              ) : (
                <Package size={26} color="var(--color-text-tertiary)" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={s.modalTitle}>{selectedEntry.product.name}</div>
              <div style={s.modalPrice}>{formatMoney(selectedEntry.sellPrice)}</div>
            </div>
            <span className={status.cls} style={{ gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 3, background: status.color }} />
              {status.label}
            </span>
          </div>

          {isPastDate ? (
            <div>
              <div style={s.fieldRow}><span style={s.fieldLabel}>{t('start')}</span><span style={s.fieldValue}>{selectedEntry.opening}</span></div>
              <div style={s.fieldRow}><span style={s.fieldLabel}>{t('remaining')}</span><span style={s.fieldValue}>{selectedEntry.remaining}</span></div>
              <div style={s.fieldRow}><span style={s.fieldLabel}>{t('sold')}</span><span style={s.fieldValue}>{selectedEntry.sold}</span></div>
            </div>
          ) : (
            <div>
              <div style={s.fieldRow}><span style={s.fieldLabel}>{t('start')}</span><span style={s.fieldValue}>{selectedEntry.opening}</span></div>
              {/* Explains why "start" is read-only here — ported from mobile,
                  which already has this hint. */}
              <p style={s.startHint}>{t('startQtyAuto')}</p>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>{t('remaining')}</span>
                <input
                  type="text" value={currentQtyInput} onChange={(e) => setCurrentQtyInput(e.target.value)}
                  style={isOverCount ? s.modalInputError : s.modalInput} inputMode="numeric"
                  aria-invalid={isOverCount}
                />
              </div>
              {isOverCount && (
                <p style={s.qtyErrorText}>{t('cannotAddMoreThanSold')}</p>
              )}
              {p && (
                <div style={s.previewBox}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>{t('preSaveCheck')}</div>
                  <div style={s.fieldRow}><span style={s.fieldLabel}>{t('previousSold')}</span><span style={s.fieldValue}>{p.prevSold}</span></div>
                  <div style={s.fieldRow}><span style={s.fieldLabel}>{t('newSold')}</span><span style={s.fieldValue}>{p.newSold}</span></div>
                  <div style={s.fieldRow}><span style={s.fieldLabel}>{t('expectedRevenue')}</span><span style={s.fieldValue}>{formatMoney(p.newRevenue)}</span></div>
                  <div style={s.fieldRow}><span style={s.fieldLabel}>{t('expectedProfit')}</span><span style={s.fieldValue}>{formatMoney(p.newProfit)}</span></div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={closeModal} style={{
              padding: '10px 18px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text)', fontSize: 14, cursor: 'pointer',
            }}>{t('back')}</button>
            {!isPastDate && (
              <button
                onClick={handleSave} disabled={saving || isOverCount}
                style={{
                  padding: '10px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--color-primary)', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: (saving || isOverCount) ? 'not-allowed' : 'pointer', opacity: (saving || isOverCount) ? 0.6 : 1,
                  display: saved ? 'none' : undefined,
                }}
              >{saving ? t('loading') : t('save')}</button>
            )}
            {saved && <span style={s.savedBadge}>{t('success')}</span>}
          </div>
        </div>
      </div>
    )
  }

  const renderSearch = () => (
    <div style={s.searchWrap}>
      <Search size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
      <input
        type="text" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '11px 15px 11px 38px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14 }}
      />
    </div>
  )

  const content = () => (
    <>
      <PageHeader
        actions={isPastDate ? <span className="badge badge-danger">{t('readOnly')}</span> : undefined}
      />
      {renderDateNav()}

      {/* Loading skeleton (no bare spinner) */}
      {loading && <InventorySkeleton />}

      {/* Error state — distinct from "genuinely empty" */}
      {!loading && fetchError && <ErrorBanner onRetry={fetchData} />}

      {/* Content: KPI row + equation caption, then search, then list —
          layout order matches the redesigned Statistics screen's shape. */}
      {!loading && !fetchError && (
        <>
          {renderKpiRow()}
          {renderSearch()}
          {filteredItems.length === 0 && (
            <div style={s.emptyWrap}>
              <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>{catalogIsEmpty ? t('addProductsFirst') : t('noInventory')}</p>
            </div>
          )}
          {filteredItems.map(entry => renderCard(entry))}
        </>
      )}
      {selectedEntry && renderModal()}
    </>
  )

  if (isFutureDate) {
    return (
      <div>
        {renderDateNav()}
        <div style={s.emptyWrap}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 500 }}>{t('futureDateNotice')}</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{t('futureDateNoticeText')}</p>
        </div>
      </div>
    )
  }

  return <div>{content()}</div>
}
