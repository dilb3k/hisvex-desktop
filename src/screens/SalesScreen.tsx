import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { inventoryApi, resolveImageUrl, getDeviceId } from '../api/client'
import { isOnline, isNetworkError } from '../utils/network'
import { enqueue, getQueueSnapshot, subscribe as subscribeQueue } from '../store/offlineQueue'
import type { QueuedInventory } from '../store/offlineQueue'
import { Minus, Plus, Package, Percent, Scan, Search, ShoppingBag, Tag, X, Wallet, ShoppingCart, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import { t } from '../i18n'
import type { InventoryItem, Product } from '../types'
import { getBusinessDate } from '../utils/businessDay'
import {
  resolveSellPrice,
  formatMoney,
  normalizeUnit,
  isWeighed,
  stepFor,
  roundQty,
  roundMoney,
  distributeTotal,
  qtyGreaterThan,
  formatQuantity,
  formatQuantityValue,
  normalizeQuantityInput,
  parseQuantityInput,
} from '../utils/inventory'
import { formatInputAmount, parseFormattedAmount } from '../styles/shared'

type DiscountMode = 'none' | 'amount' | 'percent' | 'total'

// Loading skeleton — content-shaped placeholders (search bar + hint + card
// list) instead of a bare spinner, matching the pattern already established
// on the redesigned Statistics/Inventory screens.
function skeletonBlock(h: number, delay = 0): React.CSSProperties {
  return {
    height: h, borderRadius: 12, background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', animation: 'pulse 1.4s ease-in-out infinite',
    animationDelay: `${delay}s`,
  }
}

function SalesSkeleton() {
  return (
    <div>
      <div style={{ ...skeletonBlock(42), marginBottom: 16 }} />
      <div style={{ ...skeletonBlock(36), marginBottom: 16 }} />
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...skeletonBlock(90, i * 0.05), marginBottom: 10 }} />)}
    </div>
  )
}

// Error banner — mirrors the Statistics/Inventory screens' ErrorBanner
// treatment so a genuine fetch failure reads distinctly from "no stock to
// sell" instead of both collapsing into the same empty state.
function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
      borderRadius: 14, background: 'var(--color-danger-soft)', border: '1px solid rgba(239,68,68,0.25)',
      marginBottom: 16,
    }} role="alert">
      <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)', margin: 0 }}>
        {t('statsErrorTitle') || "Ma'lumotlarni yuklab bo'lmadi"}
      </p>
      <button
        onClick={onRetry}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
          border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 12.5, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <RefreshCw size={13} />
        {t('retryLabel') || 'Qayta urinish'}
      </button>
    </div>
  )
}

export function SalesScreen() {
  const { products } = useAppStore()
  const showToast = useAppStore((s) => s.showToast)
  const applyLocalSale = useAppStore((s) => s.applyLocalSale)

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  // Per-line negotiated unit price. Absent = charge the list price; the key is
  // only ever written by an explicit edit, so clearing it restores the list
  // price without having to remember what it was.
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({})
  // Raw text of a field while it's being typed, kept separate from the
  // committed value so a half-typed "12" never becomes the charged price.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const [discountMode, setDiscountMode] = useState<DiscountMode>('none')
  const [discountInput, setDiscountInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showBarcode, setShowBarcode] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [fetchError, setFetchError] = useState(false)
  // Product ids with a sale still queued for background sync — same
  // offlineQueue.subscribe()/getQueueSnapshot() pattern InventoryScreen uses,
  // so a cashier can see which lines are still unsynced after the
  // confirmation banner auto-clears or after navigating away and back.
  const [pendingOfflineIds, setPendingOfflineIds] = useState<Set<string>>(
    () => new Set(getQueueSnapshot().inventory.map((item) => item.productId))
  )

  useEffect(() => subscribeQueue(() => {
    setPendingOfflineIds(new Set(getQueueSnapshot().inventory.map((item) => item.productId)))
  }), [])

  const loadInventory = useCallback(async () => {
    try {
      const today = getBusinessDate()
      const { data } = await inventoryApi.getByDate(today, today)
      setInventoryItems(data?.items ?? [])
      setFetchError(false)
    } catch {
      setFetchError(true)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadInventory()
      setLoading(false)
    }
    load()
  }, [loadInventory])

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {}
    for (const p of products) {
      map[p._id] = p
      if (p.localId) map[p.localId] = p
    }
    return map
  }, [products])

  const inventoryByProductId = useMemo(() => {
    const map: Record<string, InventoryItem> = {}
    for (const item of inventoryItems) map[item.productId] = item
    return map
  }, [inventoryItems])

  const sellableItems = useMemo(() => {
    return inventoryItems
      .filter(item => item.currentQuantity > 0)
      .map(item => ({
        ...item,
        product: item.product || productMap[item.productId],
      }))
      .filter(item => {
        if (!search) return true
        const name = item.product?.name || ''
        return name.toLowerCase().includes(search.toLowerCase())
      })
      .sort((a, b) => {
        const ia = a.product?.displayIndex ?? 999
        const ib = b.product?.displayIndex ?? 999
        if (ia !== ib) return ia - ib
        return (a.product?.name || '').localeCompare(b.product?.name || '')
      })
  }, [inventoryItems, productMap, search])

  const cartArray = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const item = inventoryByProductId[productId]
        const product = item?.product || productMap[productId]
        const listPrice = resolveSellPrice(item || {}, product)
        const unitPrice = priceOverrides[productId] ?? listPrice
        return {
          productId,
          quantity,
          product: product as Product | undefined,
          item,
          unit: normalizeUnit(item?.unit ?? product?.unit),
          listPrice,
          unitPrice,
          lineTotal: roundMoney(quantity * unitPrice),
        }
      })
  }, [cart, inventoryByProductId, productMap, priceOverrides])

  /**
   * Money for this sale, in one place.
   *
   * A cart-level discount is spread across the lines in proportion to what
   * each contributes, so it resolves back down to a per-unit price — the only
   * thing the API accepts. That keeps one concept ("what was each unit
   * actually sold for") on the wire instead of two, and makes the discount
   * survive correctly when a product sells at several prices in one day.
   */
  const totals = useMemo(() => {
    const subtotal = roundMoney(cartArray.reduce((sum, line) => sum + line.lineTotal, 0))
    const raw = parseFormattedAmount(discountInput)

    // Every way of cutting the price — a so'm discount, a percent, or simply
    // typing the final figure — resolves to one target amount, so there is a
    // single code path from here on.
    let target = subtotal
    if (discountMode === 'amount') target = subtotal - Math.min(raw, subtotal)
    else if (discountMode === 'percent') target = subtotal * (1 - Math.min(raw, 100) / 100)
    // An empty field means "not stated yet", not "charge nothing" — in total
    // mode zero would give the whole cart away.
    else if (discountMode === 'total') target = discountInput.trim() ? Math.min(raw, subtotal) : subtotal
    target = roundMoney(Math.max(target, 0))

    // Distributed exactly, so the amount the cashier sees is the amount the
    // server records — down to the so'm. Sending money per line (rather than a
    // per-unit price) is what makes that possible: 25 000 over 3 units has no
    // exact per-unit price.
    const shares = distributeTotal(cartArray.map(line => line.lineTotal), target)
    const lines = cartArray.map((line, i) => ({
      ...line,
      effectiveLineRevenue: shares[i] ?? line.lineTotal,
    }))

    return {
      subtotal,
      discount: roundMoney(subtotal - target),
      total: target,
      lines,
      // Line-level overrides count as a discount for display purposes too, so
      // the summary reflects everything given away, not just the cart-level cut.
      lineDiscount: roundMoney(
        cartArray.reduce((sum, line) => sum + (line.listPrice - line.unitPrice) * line.quantity, 0),
      ),
    }
  }, [cartArray, discountMode, discountInput])

  const totalPieces = useMemo(
    () => roundQty(cartArray.reduce((sum, { quantity }) => sum + quantity, 0)),
    [cartArray],
  )

  // Dropping a line has to clear everything keyed off it, not just the
  // quantity — otherwise re-adding the product would silently resurrect the
  // previous negotiated price.
  const forgetLine = useCallback((productId: string) => {
    const drop = (prev: Record<string, unknown>) => {
      const { [productId]: _removed, ...rest } = prev
      return rest
    }
    setPriceOverrides(prev => drop(prev) as Record<string, number>)
    setPriceDrafts(prev => drop(prev) as Record<string, string>)
    setQtyDrafts(prev => drop(prev) as Record<string, string>)
  }, [])

  const setQuantity = useCallback((productId: string, next: number, max: number) => {
    const clamped = roundQty(Math.max(next, 0))
    if (qtyGreaterThan(clamped, max)) {
      // Real-bug fix: tapping + at the stock limit used to just silently
      // no-op (the button also disables, but a cashier tapping fast can
      // easily miss that). Now it always gives explicit feedback.
      showToast(t('maxStockReached'), 'error')
      setCart(prev => ({ ...prev, [productId]: roundQty(max) }))
      return
    }
    setCart(prev => {
      if (clamped <= 0) {
        const { [productId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: clamped }
    })
    if (clamped <= 0) forgetLine(productId)
  }, [showToast, forgetLine])

  const handleAdd = useCallback((productId: string, max: number, unit: string) => {
    setQuantity(productId, (cart[productId] || 0) + stepFor(unit), max)
  }, [cart, setQuantity])

  const handleRemove = useCallback((productId: string, max: number, unit: string) => {
    setQuantity(productId, (cart[productId] || 0) - stepFor(unit), max)
  }, [cart, setQuantity])

  // One-tap reset of a single cart line to 0, instead of tapping "-"
  // repeatedly down to zero — a quick undo for an over-added line.
  const clearLine = useCallback((productId: string) => {
    setCart(prev => {
      const { [productId]: _removed, ...rest } = prev
      return rest
    })
    forgetLine(productId)
  }, [forgetLine])

  const clearCart = useCallback(() => {
    setCart({})
    setPriceOverrides({})
    setPriceDrafts({})
    setQtyDrafts({})
    setDiscountMode('none')
    setDiscountInput('')
  }, [])

  const commitPrice = useCallback((productId: string, raw: string, listPrice: number) => {
    const parsed = parseFormattedAmount(raw)
    setPriceDrafts(prev => {
      const { [productId]: _removed, ...rest } = prev
      return rest
    })
    // Empty or unchanged means "no override" rather than "charge zero" — a
    // cleared field should read as the list price, not as a giveaway.
    if (!raw.trim() || parsed === listPrice) {
      setPriceOverrides(prev => {
        const { [productId]: _removed, ...rest } = prev
        return rest
      })
      return
    }
    setPriceOverrides(prev => ({ ...prev, [productId]: roundMoney(Math.max(parsed, 0)) }))
  }, [])

  const resetPrice = useCallback((productId: string) => {
    setPriceOverrides(prev => {
      const { [productId]: _removed, ...rest } = prev
      return rest
    })
    setPriceDrafts(prev => {
      const { [productId]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Barcode lookup is keyed off `products`/`inventoryItems`, both already
  // in-memory maps/arrays kept in sync via useMemo above — a scan is a
  // synchronous .find() over local state, no network round-trip, so it
  // resolves in well under a millisecond. The scanner "feeling slow" was
  // a UX issue, not a lookup one: the modal used to close itself after
  // every single successful scan, forcing the cashier to reopen it by
  // hand before the next item. Now it stays open and the input refocuses
  // immediately so a wedge/USB scanner can fire scan after scan with zero
  // clicks in between; a barcode NOT found in the database is rejected
  // (see the `!product` branch below) and never added to the cart.
  const handleBarcodeSubmit = useCallback(() => {
    const code = barcodeInput.trim()
    if (!code) return

    const product = products.find(p => p.barcodes?.includes(code))
    if (!product) {
      setBarcodeError(t('barcodeNotFound'))
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }

    const invItem = inventoryItems.find(
      i => i.productId === (product.localId ?? product._id) || i.productId === product._id,
    )
    if (!invItem || invItem.currentQuantity <= 0) {
      setBarcodeError(t('noStock'))
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }

    const key = invItem.productId || product._id
    const unit = normalizeUnit(invItem.unit ?? product.unit)
    const alreadyInCart = cart[key] || 0
    if (!qtyGreaterThan(invItem.currentQuantity, alreadyInCart)) {
      setBarcodeError(t('maxStockReached'))
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }

    setCart(prev => ({ ...prev, [key]: roundQty((prev[key] || 0) + stepFor(unit)) }))
    setBarcodeInput('')
    setBarcodeError(null)
    showToast(product.name, 'success')
    // Stay open for the next scan instead of closing — a cashier scanning
    // several items in a row shouldn't have to reopen this modal each time.
    barcodeInputRef.current?.focus()
  }, [barcodeInput, products, inventoryItems, cart, showToast])

  // Applies the sale to local state and queues it for background sync
  // instead of the direct API call — used both when we're already known to
  // be offline and when an online attempt just failed with a network error.
  // This is the path that lets a cashier complete a sale with zero
  // connectivity: no network round-trip is required, only the client-side
  // stock checks already enforced by handleAdd/handleBarcodeSubmit above.
  const recordSaleOffline = useCallback((
    lines: { productId: string; quantity: number; unitPrice?: number; lineRevenue?: number }[],
    date: string,
  ) => {
    const deviceId = getDeviceId()
    const updatedAt = new Date().toISOString()

    const updatedByProductId: Record<string, InventoryItem> = {}
    for (const { productId, quantity, unitPrice, lineRevenue } of lines) {
      const existing = inventoryByProductId[productId]
      if (!existing) continue

      const listPrice = resolveSellPrice(existing, existing.product)
      const buyPrice = existing.buyPrice ?? existing.product?.buyPrice ?? 0
      // Same precedence the server uses: an exact line amount beats a
      // per-unit price, which beats the list price.
      const listRevenue = roundMoney(quantity * listPrice)
      const chargedRevenue =
        lineRevenue !== undefined
          ? roundMoney(lineRevenue)
          : unitPrice !== undefined
            ? roundMoney(quantity * unitPrice)
            : listRevenue
      const newCurrent = roundQty(Math.max(0, existing.currentQuantity - quantity))

      // Mirrors the server's sales() exactly (see inventory.service.ts): a
      // line sold off the list price moves into the locked accumulators at
      // the price actually charged, with startQuantity falling in lockstep so
      // the derived span keeps valuing only the list-price units. Doing the
      // same math here means an offline discount syncs to the identical
      // numbers the online path would have produced.
      const offList = Math.abs(chargedRevenue - listRevenue) > 0.005
      const startQuantity = existing.startQuantity ?? existing.openingQuantity ?? existing.currentQuantity

      updatedByProductId[productId] = {
        ...existing,
        currentQuantity: newCurrent,
        ...(offList
          ? {
              startQuantity: roundQty(Math.max(0, startQuantity - quantity)),
              lockedSold: roundQty((existing.lockedSold ?? 0) + quantity),
              lockedRevenue: roundMoney((existing.lockedRevenue ?? 0) + chargedRevenue),
              lockedProfit: roundMoney((existing.lockedProfit ?? 0) + chargedRevenue - quantity * buyPrice),
            }
          : {}),
      }
    }

    // Reflect the sale in the UI immediately, as if it had succeeded
    // against the server.
    setInventoryItems(prev => prev.map(item => updatedByProductId[item.productId] ?? item))
    applyLocalSale(date, lines)

    // Queue one pending inventory update per affected product, matching the
    // SyncPayload shape from step 1. enqueue() upserts by localId, so a
    // second offline sale for the same product/date before the next sync
    // simply replaces the pending entry with the latest cumulative quantity.
    for (const updated of Object.values(updatedByProductId)) {
      const { product: _product, ...withoutProduct } = updated
      const queuedItem: QueuedInventory = {
        ...withoutProduct,
        localId: updated._id,
        deviceId,
        updatedAt,
      }
      enqueue('inventory', queuedItem)
    }

    clearCart()
    // Unified with the online path: both now show the SAME inline banner
    // element (just different wording), instead of online=banner /
    // offline=toast — two different confirmation UIs made it impossible for
    // a cashier to learn one consistent "sale went through" signal. The
    // pendingOfflineIds dot on each product card (below) covers the
    // "is it still queued?" question after this banner clears.
    setSuccess(t('salesSuccessOffline'))
    setTimeout(() => setSuccess(null), 4000)
    // Deliberately not calling syncEngine.syncNow() here — the background
    // engine from step 1 already syncs on reconnect and on its own interval.
  }, [inventoryByProductId, applyLocalSale, clearCart])

  const handleConfirmSale = useCallback(async () => {
    if (totalPieces === 0 || submitting) return
    setSubmitting(true)
    try {
      const lines = totals.lines.map(({ productId, quantity, effectiveLineRevenue, listPrice }) => ({
        productId,
        quantity,
        // Only sent when it actually differs — an untouched line stays on the
        // server's cheap list-price path instead of being routed through the
        // locked-revenue accumulators for no reason.
        ...(Math.abs(effectiveLineRevenue - roundMoney(quantity * listPrice)) > 0.005
          ? { lineRevenue: effectiveLineRevenue }
          : {}),
      }))
      const today = getBusinessDate()

      if (!isOnline()) {
        recordSaleOffline(lines, today)
        return
      }

      try {
        await inventoryApi.recordSales(today, lines)
        await loadInventory()
        clearCart()
        setSuccess(t('salesSuccess'))
        setTimeout(() => setSuccess(null), 3000)
      } catch (err: unknown) {
        if (isNetworkError(err)) {
          recordSaleOffline(lines, today)
          return
        }
        throw err
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [totals, totalPieces, submitting, loadInventory, recordSaleOffline, showToast, clearCart])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SalesSkeleton />
      </div>
    )
  }

  const showEmptyNoStock = sellableItems.length === 0 && !search
  const showEmptyNotFound = sellableItems.length === 0 && search
  const hasDiscount = totals.discount > 0 || Math.abs(totals.lineDiscount) > 0.005

  const smallInput: React.CSSProperties = {
    padding: '9px 11px',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: 14.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}>
          <Search size={18} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t('searchProducts')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              color: 'var(--color-text)',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              title={t('clearSearch') || t('cancel')}
              aria-label={t('clearSearch') || t('cancel')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                borderRadius: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <p style={{
        fontSize: 13,
        color: 'var(--color-text-secondary)',
        marginBottom: 16,
        padding: '8px 12px',
        borderRadius: 6,
        background: 'var(--color-primary-soft)',
        border: '1px solid var(--color-border)',
      }}>
        {t('salesHint')}
      </p>

      {/* Genuine fetch failure — distinct from "no stock to sell" */}
      {fetchError && <ErrorBanner onRetry={loadInventory} />}

      {success && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 6,
          background: 'rgba(34,197,94,0.1)',
          color: 'var(--color-success)',
          fontSize: 13,
          marginBottom: 16,
        }}>
          {success}
        </div>
      )}

      {/* Real bug fix: when the inventory fetch itself fails, sellableItems
          is empty too, so this section used to render "Sotish uchun
          mahsulot yo'q" (no stock) directly underneath the ErrorBanner's
          "couldn't load data, retry" — two contradictory messages at once.
          Gate on !fetchError so only the retryable error shows, matching
          the mutually-exclusive loading/error/empty pattern every other
          screen (Products/Inventory/Debtors/Statistics) already follows. */}
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
        {fetchError ? null : showEmptyNoStock || showEmptyNotFound ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            color: 'var(--color-text-secondary)',
          }}>
            <ShoppingBag size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
            <p style={{ fontSize: 14 }}>
              {showEmptyNotFound ? t('noProductsFound') : t('noStock')}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sellableItems.map(item => {
              const product = item.product as Product | undefined
              const cartQty = cart[item.productId] || 0
              const isActive = cartQty > 0
              const unit = normalizeUnit(item.unit ?? product?.unit)
              const weighed = isWeighed(unit)
              const listPrice = resolveSellPrice(item, product)
              const overridden = priceOverrides[item.productId]
              const price = overridden ?? listPrice
              const isOverridden = overridden !== undefined
              const canAdd = qtyGreaterThan(item.currentQuantity, cartQty)

              return (
                <div
                  key={item.productId}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 20px' }}>
                    <div style={{
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      background: 'var(--color-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}>
                      {(product?.image || product?.imageHash) ? (
                        <img
                          src={resolveImageUrl(product.image, product.imageHash)}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <Package size={30} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{product?.name || 'N/A'}</span>
                        {pendingOfflineIds.has(item.productId) && (
                          <span title={t('pendingSync')} style={{
                            width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0,
                          }} />
                        )}
                      </p>
                      <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{t('sellPrice')}: <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{formatMoney(price)}</span></span>
                        {isOverridden && (
                          <span style={{ textDecoration: 'line-through', opacity: 0.65, fontSize: 13 }}>
                            {formatMoney(listPrice)}
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)' }}>
                        {/* Live-adjusted stock: subtract what's already in the
                            cart for this sale so the shown "qoldiq" reflects
                            what will actually remain after checkout (e.g.
                            22 in stock, 2 in cart → shows 20), instead of the
                            unchanging server-side currentQuantity. */}
                        {t('remaining')}: {formatQuantity(roundQty(item.currentQuantity - cartQty), unit)}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => handleRemove(item.productId, item.currentQuantity, unit)}
                        disabled={cartQty === 0}
                        title="Kamaytirish"
                        aria-label="Kamaytirish"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 46,
                          height: 46,
                          borderRadius: 10,
                          border: `1px solid ${cartQty > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: cartQty > 0 ? 'var(--color-primary-soft)' : 'transparent',
                          color: cartQty > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          cursor: cartQty === 0 ? 'not-allowed' : 'pointer',
                          opacity: cartQty === 0 ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Minus size={20} />
                      </button>
                      {/* Weighed goods get a real input instead of only a
                          stepper: reaching 1.75 kg by tapping +0.1 seventeen
                          times is not a checkout flow. Counted goods keep the
                          read-only badge, where the stepper is the fast path. */}
                      {weighed ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={t('quantity')}
                          value={qtyDrafts[item.productId] ?? (cartQty > 0 ? formatQuantityValue(cartQty, unit) : '')}
                          placeholder="0"
                          onChange={(e) => setQtyDrafts(prev => ({
                            ...prev,
                            [item.productId]: normalizeQuantityInput(e.target.value, unit),
                          }))}
                          onBlur={(e) => {
                            const raw = e.target.value
                            setQtyDrafts(prev => {
                              const { [item.productId]: _removed, ...rest } = prev
                              return rest
                            })
                            setQuantity(item.productId, parseQuantityInput(raw, unit), item.currentQuantity)
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          style={{
                            width: 74,
                            textAlign: 'center',
                            padding: '11px 4px',
                            borderRadius: 9,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg)',
                            color: 'var(--color-text)',
                            fontSize: 17,
                            fontWeight: 700,
                            fontFamily: 'inherit',
                            outline: 'none',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      ) : (
                        <span style={{
                          fontSize: 19,
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          minWidth: 32,
                          textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {cartQty}
                        </span>
                      )}
                      <button
                        onClick={() => handleAdd(item.productId, item.currentQuantity, unit)}
                        title="Ko'paytirish"
                        aria-label="Ko'paytirish"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 46,
                          height: 46,
                          borderRadius: 10,
                          border: `1px solid ${canAdd ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: canAdd ? 'var(--color-primary-soft)' : 'transparent',
                          color: canAdd ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          cursor: canAdd ? 'pointer' : 'not-allowed',
                          opacity: canAdd ? 1 : 0.5,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  {isActive && (
                    <div style={{
                      padding: '10px 14px',
                      borderTop: '1px solid var(--color-border)',
                      background: 'var(--color-primary-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}>
                      {/* Per-line price edit — the customer who negotiates a
                          different price for one item is the common case; a
                          cart-wide discount is the separate control below. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', minWidth: 180 }}>
                        <Tag size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={t('editPrice')}
                          value={priceDrafts[item.productId] ?? formatInputAmount(String(price))}
                          onChange={(e) => setPriceDrafts(prev => ({
                            ...prev,
                            [item.productId]: formatInputAmount(e.target.value),
                          }))}
                          onBlur={(e) => commitPrice(item.productId, e.target.value, listPrice)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          style={{
                            ...smallInput,
                            flex: 1,
                            borderColor: isOverridden ? 'var(--color-primary)' : 'var(--color-border)',
                            color: isOverridden ? 'var(--color-primary)' : 'var(--color-text)',
                          }}
                        />
                        {isOverridden && (
                          <button
                            onClick={() => resetPrice(item.productId)}
                            title={t('resetPrice')}
                            aria-label={t('resetPrice')}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 30, height: 30, borderRadius: 7, border: 'none',
                              background: 'transparent', color: 'var(--color-text-secondary)',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto',
                        fontSize: 15, fontWeight: 700, color: 'var(--color-primary)',
                      }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(roundMoney(cartQty * price))}</span>
                        {/* One-tap line reset — avoids tapping "-" repeatedly
                            down to zero to undo an over-added line. */}
                        <button
                          onClick={() => clearLine(item.productId)}
                          title={t('clearLine')}
                          aria-label={t('clearLine')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 7, border: 'none',
                            background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showBarcode && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            width: 360,
            padding: 24,
            borderRadius: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>
              {t('barcode')}ni kiriting
            </h3>
            <input
              ref={barcodeInputRef}
              type="text"
              autoFocus
              placeholder={t('barcode')}
              value={barcodeInput}
              onChange={e => { setBarcodeInput(e.target.value); setBarcodeError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleBarcodeSubmit() }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${barcodeError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 16,
                fontFamily: 'monospace',
                marginBottom: barcodeError ? 8 : 16,
                boxSizing: 'border-box',
              }}
            />
            {/* Real-bug fix: this used to blind-close on any failure with
                zero feedback. Now the reason stays visible and the modal
                stays open so the cashier can correct/retry immediately. */}
            {barcodeError && (
              <p style={{ fontSize: 12.5, color: 'var(--color-danger)', fontWeight: 600, margin: '0 0 16px' }}>
                {barcodeError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleBarcodeSubmit}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('confirm')}
              </button>
              <button
                onClick={() => { setShowBarcode(false); setBarcodeInput(''); setBarcodeError(null) }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'sticky',
        bottom: 0,
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        borderRadius: '12px 12px 0 0',
        padding: '12px 16px',
      }}>
        {/* Cart-wide discount. Kept out of the way until there is something
            to discount, so the default checkout is still two clicks. */}
        {totalPieces > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Percent size={14} />
              {t('discount')}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['none', 'amount', 'percent', 'total'] as DiscountMode[]).map((mode) => {
                const active = discountMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      setDiscountMode(mode)
                      setDiscountInput(mode === 'total' ? formatInputAmount(String(totals.total)) : '')
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-primary-soft)' : 'transparent',
                      color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {mode === 'none'
                      ? t('noDiscount')
                      : mode === 'amount'
                        ? "so'm"
                        : mode === 'percent'
                          ? '%'
                          : t('finalPrice')}
                  </button>
                )
              })}
            </div>
            {discountMode !== 'none' && (
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                aria-label={discountMode === 'percent' ? t('discountPercent') : discountMode === 'total' ? t('finalPrice') : t('discountAmount')}
                placeholder={discountMode === 'percent' ? '10' : discountMode === 'total' ? formatInputAmount(String(totals.subtotal)) : '5 000'}
                value={discountInput}
                onChange={(e) => setDiscountInput(formatInputAmount(e.target.value))}
                style={{ ...smallInput, flex: '1 1 120px', maxWidth: 170 }}
              />
            )}
          </div>
        )}

        {/* Running-total KPI chips — same icon-chip + label + tabular-nums
            value pattern, and the same --color-metric-revenue/qty identity
            colors, as the redesigned Statistics/Inventory screens. Replaces
            the old plain-text pairs, which sat visually quieter than the
            buttons below them despite being the most important thing to see
            mid-sale. */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{
            flex: 1.4, display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--color-metric-revenue-soft)', borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: 'var(--color-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              color: 'var(--color-metric-revenue)',
            }}><Wallet size={17} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('saleTotal')}</div>
              <div style={{
                fontSize: 19, fontWeight: 800, color: 'var(--color-metric-revenue)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
              }}>
                {/* Directly editable: the most common real-world ask is "u
                    shuncha berdi" — the cashier states the money taken and
                    everything else (per-line amounts, the discount, the
                    profit) follows from it, rather than making them work
                    backwards to a percentage. */}
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={t('saleTotal')}
                  disabled={totalPieces === 0}
                  value={discountMode === 'total' ? discountInput : formatInputAmount(String(totals.total))}
                  onChange={(e) => { setDiscountMode('total'); setDiscountInput(formatInputAmount(e.target.value)) }}
                  onFocus={() => {
                    if (discountMode !== 'total') {
                      setDiscountMode('total')
                      setDiscountInput(formatInputAmount(String(totals.total)))
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    borderBottom: `1px dashed ${totalPieces === 0 ? 'transparent' : 'var(--color-border)'}`,
                    background: 'transparent',
                    outline: 'none',
                    fontSize: 19,
                    fontWeight: 800,
                    color: 'var(--color-metric-revenue)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: -0.3,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              {/* Only shown when money was actually given away, so the normal
                  sale keeps a single clean number. */}
              {hasDiscount && (
                <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                    {formatMoney(roundMoney(totals.subtotal + totals.lineDiscount))}
                  </span>
                  {' · '}
                  <span style={{ color: 'var(--color-danger)' }}>
                    −{formatMoney(roundMoney(totals.discount + totals.lineDiscount))}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--color-metric-qty-soft)', borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: 'var(--color-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              color: 'var(--color-metric-qty)',
            }}><ShoppingCart size={17} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('soldPieces')}</div>
              <div style={{
                fontSize: 19, fontWeight: 800, color: 'var(--color-metric-qty)',
                fontVariantNumeric: 'tabular-nums',
              }}>{formatQuantityValue(totalPieces, 'kg')}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={clearCart}
            disabled={totalPieces === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '12px 12px',
              borderRadius: 9,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              fontSize: 14,
              cursor: totalPieces === 0 ? 'not-allowed' : 'pointer',
              opacity: totalPieces === 0 ? 0.5 : 1,
              flex: 1,
            }}
          >
            <X size={17} />
            {t('cancel')}
          </button>
          <button
            onClick={() => { setBarcodeError(null); setShowBarcode(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '12px 12px',
              borderRadius: 9,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              fontSize: 14,
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <Scan size={17} />
            {t('barcode')}
          </button>
          <button
            onClick={handleConfirmSale}
            disabled={totalPieces === 0 || submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '12px 12px',
              borderRadius: 9,
              border: 'none',
              background: totalPieces === 0 || submitting ? 'var(--color-border)' : 'var(--color-primary)',
              color: totalPieces === 0 || submitting ? 'var(--color-text-secondary)' : '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: totalPieces === 0 || submitting ? 'not-allowed' : 'pointer',
              flex: 1.5,
            }}
          >
            {submitting ? t('loading') : t('confirmSale')}
          </button>
        </div>
      </div>
    </div>
  )
}
