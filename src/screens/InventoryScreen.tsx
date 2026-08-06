import { useEffect, useState, useMemo, useCallback, forwardRef } from 'react'
import { inventoryApi, resolveImageUrl, clearApiCache, getDeviceId } from '../api/client'
import { useAppStore } from '../store/appStore'
import dayjs from 'dayjs'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { ChevronLeft, ChevronRight, Package, Search } from 'lucide-react'
import { t } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import type { Product, InventoryItem } from '../types'
import { formatMoney, overlay } from '../styles/shared'
import { getBusinessDate } from '../utils/businessDay'
import { resolveSellPrice, resolveBuyPrice } from '../utils/inventory'
import { isOnline, isNetworkError } from '../utils/network'
import { enqueue } from '../store/offlineQueue'
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
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  summaryItem: { padding: '16px 18px', borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', textAlign: 'center' },
  summaryLabel: { fontSize: 12, color: 'var(--color-text-secondary)' },
  summaryValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  card: { padding: 18, borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow 0.15s' },
  modal: { width: 440, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  modalPrice: { fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16 },
  fieldRow: { display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--color-border)' },
  fieldLabel: { fontSize: 14, color: 'var(--color-text-secondary)' },
  fieldValue: { fontSize: 14, fontWeight: 600 },
  modalInput: { width: 130, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, textAlign: 'right', outline: 'none' },
  previewBox: { marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' },
  savedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'var(--color-success)', color: '#fff', fontSize: 12, fontWeight: 600, animation: 'fadeIn 0.2s ease' },
  spinnerWrap: { display: 'flex', justifyContent: 'center', padding: 80 },
  emptyWrap: { textAlign: 'center', padding: 60, color: 'var(--color-text-secondary)' },
  searchWrap: { position: 'relative', marginBottom: 12 },
}

export function InventoryScreen() {
  const showToast = useAppStore((s) => s.showToast)
  const [selectedDate, setSelectedDate] = useState(getBusinessDate)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedEntry, setSelectedEntry] = useState<EnrichedItem | null>(null)
  const [currentQtyInput, setCurrentQtyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Product ids whose current-quantity edit was applied optimistically and
  // queued for background sync (offline or a network failure mid-save).
  // Simple local marker only — the real sync-status UI lands in a later step.
  const [pendingOfflineIds, setPendingOfflineIds] = useState<Set<string>>(new Set())

  const isPastDate = dayjs(selectedDate).isBefore(getBusinessDate(), 'day')
  const isFutureDate = dayjs(selectedDate).isAfter(getBusinessDate(), 'day')
  const isEditable = !isPastDate && !isFutureDate
  const refreshKey = useAppStore((s) => s.refreshKey)

  useEffect(() => {
    if (isFutureDate) { setItems([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    inventoryApi.getByDate(selectedDate, selectedDate)
      .then(({ data }) => {
        if (!cancelled) setItems(data?.items ?? [])
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedDate, isFutureDate, refreshKey])

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
    let remaining = 0, sold = 0, revenue = 0, profit = 0
    for (const e of combinedData) { remaining += e.remaining; sold += e.sold; revenue += e.revenue; profit += e.realizedProfit }
    return { remaining, sold, revenue, profit }
  }, [combinedData])

  const goToPrevDay = useCallback(() => setSelectedDate((prev) => dayjs(prev).subtract(1, 'day').format('YYYY-MM-DD')), [])
  const goToNextDay = useCallback(() => setSelectedDate((prev) => dayjs(prev).add(1, 'day').format('YYYY-MM-DD')), [])

  const openModal = (entry: EnrichedItem) => { setSelectedEntry(entry); setCurrentQtyInput(String(entry.current)); setSaved(false) }
  const closeModal = () => { setSelectedEntry(null); setCurrentQtyInput('') }

  // Applies the edited current-quantity to local state, matching the same
  // derived-field recompute (sold/revenue/realizedProfit) the online path
  // gets from a fresh server response — used both when saving offline and
  // when an online attempt just failed with a network error.
  const applyQuantityLocally = useCallback((productId: string, newQty: number) => {
    setItems((prev) => prev.map((item) => {
      if (item.productId !== productId && item.product?._id !== productId) return item
      const opening = item.startQuantity ?? item.openingQuantity ?? 0
      const newSold = Math.max(opening - newQty, 0)
      const sp = resolveSellPrice(item, item.product)
      const bp = resolveBuyPrice(item, item.product)
      return {
        ...item,
        currentQuantity: newQty,
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
      enqueue('inventory', queuedItem)
    }

    setPendingOfflineIds((prev) => new Set(prev).add(productId))
    setSaved(true)
    showToast(t('inventorySavedOffline'), 'success')
    setTimeout(() => closeModal(), 700)
  }, [applyQuantityLocally, selectedEntry, showToast])

  const handleSave = async () => {
    if (!selectedEntry || !isEditable) return
    setSaving(true)
    try {
      const newQty = parseWholeNumber(currentQtyInput)
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
    if (!selectedEntry || !isEditable) return null
    const newCurrent = parseWholeNumber(currentQtyInput)
    const newSold = Math.max(selectedEntry.opening - newCurrent, 0)
    const newRevenue = newSold * selectedEntry.sellPrice
    const newProfit = newSold * (selectedEntry.sellPrice - selectedEntry.buyPrice)
    return { prevSold: selectedEntry.sold, newSold, newRevenue, newProfit }
  }, [selectedEntry, currentQtyInput, isEditable])

  const DateInput = forwardRef<HTMLDivElement, { value?: string; onClick?: () => void }>(({ value, onClick }, ref) => (
    <div ref={ref} onClick={onClick} style={s.dateDisplay}>
      <span style={s.dateText}>{value}</span>
      <span style={s.weekdayText}>{dayjs(selectedDate).format('dddd')}</span>
    </div>
  ))

  const renderDateNav = () => (
    <div style={s.dateNav}>
      <button onClick={goToPrevDay} style={s.dateNavBtn}><ChevronLeft size={18} /></button>
      <DatePicker
        selected={dayjs(selectedDate).toDate()}
        onChange={(date: Date | null) => { if (date) setSelectedDate(dayjs(date).format('YYYY-MM-DD')) }}
        dateFormat="DD MMM YYYY"
        customInput={<DateInput />}
      />
      <button onClick={goToNextDay} style={s.dateNavBtn}><ChevronRight size={18} /></button>
    </div>
  )

  const renderCard = (entry: EnrichedItem) => {
    const status = getStockStatus(entry.remaining)
    const productId = entry.inv?.productId ?? entry.product._id
    const isPendingSync = pendingOfflineIds.has(productId)
    return (
      <div key={entry.product._id} style={s.card} onClick={() => openModal(entry)}>
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
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>{t('remaining')}</span>
                <input type="text" value={currentQtyInput} onChange={(e) => setCurrentQtyInput(e.target.value)} style={s.modalInput} inputMode="numeric" />
              </div>
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
                onClick={handleSave} disabled={saving}
                style={{
                  padding: '10px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--color-primary)', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
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
        style={{ width: '100%', padding: '11px 15px 11px 38px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, outline: 'none' }}
      />
    </div>
  )

  const content = () => (
    <>
      <PageHeader
        title={t('inventory')}
        actions={isPastDate ? <span className="badge badge-danger">{t('readOnly')}</span> : undefined}
      />
      {renderDateNav()}
      {renderSearch()}
      <div style={s.summaryRow}>
        <div style={s.summaryItem}><div style={s.summaryLabel}>{t('remaining')}</div><div style={s.summaryValue}>{totals.remaining}</div></div>
        <div style={s.summaryItem}><div style={s.summaryLabel}>{t('sold')}</div><div style={s.summaryValue}>{totals.sold}</div></div>
        <div style={s.summaryItem}><div style={s.summaryLabel}>{t('revenue')}</div><div style={s.summaryValue}>{formatMoney(totals.revenue)}</div></div>
        <div style={s.summaryItem}><div style={s.summaryLabel}>{t('profit')}</div><div style={{ ...s.summaryValue, color: 'var(--color-success)' }}>{formatMoney(totals.profit)}</div></div>
      </div>
      {loading && <div style={s.spinnerWrap}><div style={{ width: 28, height: 28, border: '2.5px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}
      {!loading && filteredItems.length === 0 && (
        <div style={s.emptyWrap}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 500 }}>{t('noInventory')}</p>
        </div>
      )}
      {filteredItems.map(entry => renderCard(entry))}
      {selectedEntry && renderModal()}
    </>
  )

  if (isFutureDate) {
    return (
      <div>
        <PageHeader title={t('inventory')} />
        {renderDateNav()}
        <div style={s.emptyWrap}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 500 }}>{t('futureDateNotice')}</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{t('futureDateNoticeText')}</p>
        </div>
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div>
        <PageHeader title={t('inventory')} />
        {renderDateNav()}
        <div style={s.spinnerWrap}><div style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
      </div>
    )
  }

  return <div>{content()}</div>
}
