import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { inventoryApi, resolveImageUrl, getDeviceId } from '../api/client'
import { isOnline, isNetworkError } from '../utils/network'
import { enqueue, getQueueSnapshot, subscribe as subscribeQueue } from '../store/offlineQueue'
import type { QueuedInventory } from '../store/offlineQueue'
import { Minus, Plus, Package, Scan, Search, ShoppingBag, X, Wallet, ShoppingCart, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import { t } from '../i18n'
import type { InventoryItem, Product } from '../types'
import { getBusinessDate } from '../utils/businessDay'
import { resolveSellPrice, formatMoney } from '../utils/inventory'

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
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const item = inventoryByProductId[productId]
        const product = item?.product || productMap[productId]
        return { productId, quantity, product: product as Product | undefined, item }
      })
  }, [cart, inventoryByProductId, productMap])

  const totalRevenue = useMemo(() => {
    return cartArray.reduce((sum, { quantity, product, item }) => {
      const price = resolveSellPrice(item || {}, product)
      return sum + quantity * price
    }, 0)
  }, [cartArray])

  const totalPieces = useMemo(() => {
    return cartArray.reduce((sum, { quantity }) => sum + quantity, 0)
  }, [cartArray])

  const handleAdd = useCallback((productId: string, max: number) => {
    setCart(prev => {
      const current = prev[productId] || 0
      if (current >= max) {
        // Real-bug fix: tapping + at the stock limit used to just silently
        // no-op (the button also disables, but a cashier tapping fast can
        // easily miss that). Now it always gives explicit feedback.
        showToast(t('maxStockReached'), 'error')
        return prev
      }
      return { ...prev, [productId]: current + 1 }
    })
  }, [showToast])

  const handleRemove = useCallback((productId: string) => {
    setCart(prev => {
      const current = prev[productId] || 0
      if (current <= 1) {
        const { [productId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: current - 1 }
    })
  }, [])

  // One-tap reset of a single cart line to 0, instead of tapping "-"
  // repeatedly down to zero — a quick undo for an over-added line.
  const clearLine = useCallback((productId: string) => {
    setCart(prev => {
      const { [productId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearCart = useCallback(() => {
    setCart({})
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
    const alreadyInCart = cart[key] || 0
    if (alreadyInCart >= invItem.currentQuantity) {
      setBarcodeError(t('maxStockReached'))
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }

    setCart(prev => ({ ...prev, [key]: alreadyInCart + 1 }))
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
  const recordSaleOffline = useCallback((lines: { productId: string; quantity: number }[], date: string) => {
    const deviceId = getDeviceId()
    const updatedAt = new Date().toISOString()

    const updatedByProductId: Record<string, InventoryItem> = {}
    for (const { productId, quantity } of lines) {
      const existing = inventoryByProductId[productId]
      if (!existing) continue
      updatedByProductId[productId] = {
        ...existing,
        currentQuantity: Math.max(0, existing.currentQuantity - quantity),
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

    setCart({})
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
  }, [inventoryByProductId, applyLocalSale])

  const handleConfirmSale = useCallback(async () => {
    if (totalPieces === 0 || submitting) return
    setSubmitting(true)
    try {
      const lines = cartArray.map(({ productId, quantity }) => ({
        productId,
        quantity,
      }))
      const today = getBusinessDate()

      if (!isOnline()) {
        recordSaleOffline(lines, today)
        return
      }

      try {
        await inventoryApi.recordSales(today, lines)
        await loadInventory()
        setCart({})
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
  }, [cartArray, totalPieces, submitting, loadInventory, recordSaleOffline, showToast])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SalesSkeleton />
      </div>
    )
  }

  const showEmptyNoStock = sellableItems.length === 0 && !search
  const showEmptyNotFound = sellableItems.length === 0 && search

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

      <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
        {showEmptyNoStock || showEmptyNotFound ? (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sellableItems.map(item => {
              const product = item.product as Product | undefined
              const cartQty = cart[item.productId] || 0
              const isActive = cartQty > 0
              const price = resolveSellPrice(item, product)

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                    <div style={{
                      width: 58,
                      height: 58,
                      borderRadius: 10,
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
                        <Package size={26} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 3,
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
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 1 }}>
                        {t('sellPrice')}: <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{formatMoney(price)}</span>
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {t('remaining')}: {item.currentQuantity}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => handleRemove(item.productId)}
                        disabled={cartQty === 0}
                        title="Kamaytirish"
                        aria-label="Kamaytirish"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 38,
                          height: 38,
                          borderRadius: 9,
                          border: `1px solid ${cartQty > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: cartQty > 0 ? 'var(--color-primary-soft)' : 'transparent',
                          color: cartQty > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          cursor: cartQty === 0 ? 'not-allowed' : 'pointer',
                          opacity: cartQty === 0 ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Minus size={18} />
                      </button>
                      <span style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        minWidth: 30,
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {cartQty}
                      </span>
                      <button
                        onClick={() => handleAdd(item.productId, item.currentQuantity)}
                        title="Ko'paytirish"
                        aria-label="Ko'paytirish"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 38,
                          height: 38,
                          borderRadius: 9,
                          border: `1px solid ${cartQty < item.currentQuantity ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: cartQty < item.currentQuantity ? 'var(--color-primary-soft)' : 'transparent',
                          color: cartQty < item.currentQuantity ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          cursor: cartQty >= item.currentQuantity ? 'not-allowed' : 'pointer',
                          opacity: cartQty >= item.currentQuantity ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {isActive && (
                    <div style={{
                      padding: '8px 12px 8px 16px',
                      borderTop: '1px solid var(--color-border)',
                      background: 'var(--color-primary-soft)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 14,
                      color: 'var(--color-primary)',
                      fontWeight: 600,
                    }}>
                      <span>{t('saleTotal')}:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{formatMoney(cartQty * price)}</span>
                        {/* One-tap line reset — avoids tapping "-" repeatedly
                            down to zero to undo an over-added line. */}
                        <button
                          onClick={() => clearLine(item.productId)}
                          title={t('clearLine')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: 7, border: 'none',
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
              }}>{formatMoney(totalRevenue)}</div>
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
              }}>{totalPieces}</div>
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
