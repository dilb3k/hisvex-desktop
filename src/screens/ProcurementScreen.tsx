import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import {
  createProcurementIntent,
  type ProcurementItem,
} from '../utils/procurementIntent'
import { procurementApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import './procurement.css'
import {
  ProcurementKpis,
  ProcurementTools,
  PriceAlert,
  ProcurementHistory,
} from './ProcurementInsights'
import {
  procurementQuantity,
  type ProcurementReceipt,
} from '../utils/procurementTypes'

type Product = {
  id: string
  name: string
  unit: 'kg' | 'dona'
  quantity: number
  buyPrice: number
  barcodes?: string[]
}
type Receipt = ProcurementReceipt
const number = (value: number) =>
  value.toLocaleString('uz-UZ', { maximumFractionDigits: 3 })
const money = (value: number) =>
  value.toLocaleString('uz-UZ', { maximumFractionDigits: 2 })

export function ProcurementScreen({
  catalogOnly = false,
}: {
  catalogOnly?: boolean
}) {
  const user = useAuthStore((s) => s.user)
  const owner = user?._id ?? ''
  const identity = useAuthStore((s) => s.token)
  const [products, setProducts] = useState<Product[]>([])
  const [history, setHistory] = useState<Receipt[]>([])
  const [items, setItems] = useState<ProcurementItem[]>([])
  const [supplier, setSupplier] = useState('')
  const priceRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | 'confirm' | ''>('')
  const busyRef = useRef(false)
  const fetchVersion = useRef(0)
  const quantityRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<'catalog' | 'new'>('catalog')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [productId, setProductId] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<'dona' | 'kg'>('dona')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const isCurrent = useCallback(
    () => useAuthStore.getState().token === identity,
    [identity],
  )
  const intent = useMemo(() => {
    const key = `hisvex_procurement:${owner}`
    return createProcurementIntent(
      {
        read: async () => {
          const saved = localStorage.getItem(key)
          if (!saved) return null
          const plain = await window.electronAPI?.safeStorageDecrypt(saved)
          if (!plain) throw Error('Saqlangan kirimni ochib bo‘lmadi')
          return JSON.parse(plain)
        },
        write: async (value) => {
          const encrypted = await window.electronAPI?.safeStorageEncrypt(
            JSON.stringify(value),
          )
          if (!encrypted) throw Error('Xavfsiz saqlash ishlamadi')
          localStorage.setItem(key, encrypted)
        },
      },
      () => crypto.randomUUID(),
      () => {
        if (useAuthStore.getState().token !== identity)
          throw Error('Sessiya o‘zgardi')
      },
    )
  }, [owner, identity])
  const refresh = useCallback(async () => {
    const version = ++fetchVersion.current
    setLoading(true)
    const [catalog, receipts] = await Promise.allSettled([
      procurementApi.products(),
      procurementApi.list(),
    ])
    if (!isCurrent() || version !== fetchVersion.current) return
    if (catalog.status === 'fulfilled') {
      setProducts(catalog.value)
      setCatalogError('')
    } else setCatalogError('Mahsulotlar yuklanmadi. Qayta urinib ko‘ring.')
    if (receipts.status === 'fulfilled') {
      setHistory(receipts.value)
      setHistoryError('')
    } else setHistoryError('Kirimlar tarixi yuklanmadi. Qayta urinib ko‘ring.')
    setLoading(false)
  }, [isCurrent])
  const loadDraft = useCallback(async () => {
    try {
      const saved = await intent.load()
      if (!isCurrent()) return
      setItems(saved.items)
      setSupplier(saved.supplier ?? '')
      setPending(!!saved.id)
      setReady(true)
      setError('')
    } catch (e) {
      if (isCurrent()) setError((e as Error).message)
    }
  }, [intent, isCurrent])
  useEffect(() => {
    const requests = fetchVersion
    setReady(false)
    setItems([])
    setSupplier('')
    setPending(false)
    setProducts([])
    setHistory([])
    setEditing(null)
    setProductId('')
    setName('')
    setPrice('')
    setQuantity('1')
    setUnit('dona')
    setError('')
    setNotice('')
    setBusy('')
    busyRef.current = false
    void loadDraft()
    void refresh()
    const onRefresh = () => {
      void refresh()
    }
    window.addEventListener('hisvex-procurement-refresh', onRefresh)
    return () => {
      ++requests.current
      window.removeEventListener('hisvex-procurement-refresh', onRefresh)
    }
  }, [loadDraft, refresh])
  const filteredProducts = useMemo(
    () =>
      products.filter((p) =>
        p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ),
    [products, search],
  )
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.buyPrice,
    0,
  )
  const lineTotal = Number(quantity) * Number(price)
  const locked = !ready || pending || !!busy
  const resetForm = () => {
    setEditing(null)
    setProductId('')
    setName('')
    setUnit('dona')
    setPrice('')
    setQuantity('1')
  }
  const choose = (product: Product) => {
    setMode('catalog')
    setProductId(product.id)
    setName(product.name)
    setUnit(product.unit)
    setPrice(String(product.buyPrice))
    quantityRef.current?.focus()
  }
  const switchMode = (next: 'catalog' | 'new') => {
    setMode(next)
    resetForm()
    setError('')
  }
  const edit = (index: number) => {
    if (locked) return
    const item = items[index]
    setEditing(index)
    setMode(item.productId ? 'catalog' : 'new')
    setProductId(item.productId ?? '')
    setName(item.name)
    setUnit(item.unit)
    setQuantity(String(item.quantity))
    setPrice(String(item.buyPrice))
    setError('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    quantityRef.current?.focus({ preventScroll: true })
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (locked || busyRef.current) return
    busyRef.current = true
    setBusy('save')
    setError('')
    setNotice('')
    try {
      if (mode === 'catalog' && !productId)
        throw Error('Avval mahsulotni tanlang')
      if (!price.trim() || !quantity.trim())
        throw Error('Miqdor va xarid narxini kiriting')
      const line: ProcurementItem = {
        ...(productId ? { productId } : {}),
        name: name.trim(),
        unit,
        quantity: Number(quantity),
        buyPrice: Number(price),
        ...(editing !== null && items[editing]?.barcodes
          ? { barcodes: items[editing].barcodes }
          : {}),
      }
      const nextItems =
        editing === null
          ? [...items, line]
          : items.map((item, index) => (index === editing ? line : item))
      const next = await intent.saveDraft(nextItems, supplier)
      if (!isCurrent()) return
      setItems(next.items)
      resetForm()
      setNotice(
        editing === null
          ? 'Mahsulot savatga qo‘shildi'
          : 'Savatdagi mahsulot yangilandi',
      )
    } catch (e) {
      if (isCurrent()) setError((e as Error).message)
    } finally {
      if (isCurrent()) {
        busyRef.current = false
        setBusy('')
      }
    }
  }
  const remove = async (index: number) => {
    if (locked || busyRef.current) return
    busyRef.current = true
    setBusy('remove')
    setError('')
    setNotice('')
    try {
      const next = await intent.saveDraft(
        items.filter((_, i) => i !== index),
        supplier,
      )
      if (!isCurrent()) return
      setItems(next.items)
      if (editing === index) resetForm()
      else if (editing !== null && editing > index) setEditing(editing - 1)
    } catch (e) {
      if (isCurrent()) setError((e as Error).message)
    } finally {
      if (isCurrent()) {
        busyRef.current = false
        setBusy('')
      }
    }
  }
  const confirm = async () => {
    if (!ready || busyRef.current || !items.length || editing !== null) return
    busyRef.current = true
    setBusy('confirm')
    setError('')
    setNotice('')
    try {
      if (!pending) await intent.saveDraft(items, supplier)
      await intent.confirm(procurementApi.submit)
      if (!isCurrent()) return
      setItems([])
      setSupplier('')
      setPending(false)
      resetForm()
      setNotice('Kirim tasdiqlandi. Mahsulot qoldiqlari yangilandi.')
      await refresh()
    } catch (e) {
      if (!isCurrent()) return
      setError((e as Error).message)
      try {
        const saved = await intent.load()
        if (isCurrent()) {
          setItems(saved.items)
          setSupplier(saved.supplier ?? '')
          setPending(!!saved.id)
        }
      } catch {
        /* Keep the last readable cart on a storage error. */
      }
    } finally {
      if (isCurrent()) {
        busyRef.current = false
        setBusy('')
      }
    }
  }
  const changeSupplier = (value: string) => {
    if (locked) return
    setSupplier(value)
    void intent.saveSupplier(value).catch((e) => {
      if (isCurrent()) setError((e as Error).message)
    })
  }
  const quickAdd = async (line: ProcurementItem) => {
    if (locked || busyRef.current) throw Error('Savat hozir band')
    busyRef.current = true
    setBusy('save')
    try {
      const next = await intent.saveDraft([...items, line], supplier)
      if (!isCurrent()) throw Error('Sessiya o‘zgardi')
      setItems(next.items)
      setNotice('Yangi mahsulot savatga qo‘shildi')
    } finally {
      if (isCurrent()) {
        busyRef.current = false
        setBusy('')
      }
    }
  }
  const retry = () => {
    void refresh()
    if (!ready) void loadDraft()
  }
  const searchField = (
    <div className="pc-search">
      <Search size={18} aria-hidden="true" />
      <input
        aria-label="Mahsulot qidirish"
        placeholder="Mahsulot nomi bo‘yicha qidirish…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={!catalogOnly && locked}
      />
      {search && (
        <button
          type="button"
          className="pc-icon-btn"
          aria-label="Qidiruvni tozalash"
          onClick={() => setSearch('')}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
  const catalogStatus = catalogError ? (
    <div className="pc-inline-error" role="alert">
      <AlertCircle size={18} />
      <span>{catalogError}</span>
      <button type="button" onClick={retry} disabled={loading}>
        Qayta urinish
      </button>
    </div>
  ) : loading && !products.length ? (
    <div className="pc-empty" role="status">
      <Loader2 className="pc-spin" size={24} />
      <p>Mahsulotlar yuklanmoqda…</p>
    </div>
  ) : !filteredProducts.length ? (
    <div className="pc-empty">
      <Package size={28} />
      <strong>{search ? 'Mahsulot topilmadi' : 'Hali mahsulot yo‘q'}</strong>
      <p>
        {search
          ? 'Boshqa nom bilan qidirib ko‘ring.'
          : 'Birinchi mahsulotni yangi kirim orqali qo‘shing.'}
      </p>
      {!catalogOnly && (
        <button
          type="button"
          className="pc-btn pc-btn-secondary"
          disabled={locked}
          onClick={() => switchMode('new')}
        >
          <Plus size={16} />
          Yangi mahsulot
        </button>
      )}
    </div>
  ) : null

  return (
    <section className="pc-page">
      <header className="pc-page-header">
        <div className="pc-title-group">
          <span className="pc-page-icon">
            <ArrowDownToLine size={23} />
          </span>
          <div>
            <h1>{catalogOnly ? 'Mahsulotlar' : 'Kirimlar'}</h1>
            <p>
              {catalogOnly
                ? 'Mahsulot qoldiqlari va xarid narxlari'
                : 'Mahsulotlarni savatga yig‘ing va bir marta tasdiqlang'}
            </p>
          </div>
        </div>
        <button
          className="pc-btn pc-btn-secondary pc-refresh"
          type="button"
          onClick={retry}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'pc-spin' : ''} />
          <span>Yangilash</span>
        </button>
      </header>
      {!catalogOnly && (
        <>
          <ProcurementKpis revision={history} />
          <ProcurementTools
            products={products}
            locked={locked}
            supplier={supplier}
            onSupplier={changeSupplier}
            onChoose={choose}
            onAdd={quickAdd}
            focusRevision={items}
          />
        </>
      )}
      {error && (
        <div className="pc-banner pc-banner-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="pc-banner pc-banner-success" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button
            type="button"
            className="pc-icon-btn"
            onClick={() => setNotice('')}
            aria-label="Xabarni yopish"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {catalogOnly ? (
        <div className="pc-panel">
          <div className="pc-panel-heading">
            <div>
              <h2>
                Mahsulotlar katalogi{' '}
                <span className="pc-count">{products.length}</span>
              </h2>
              <p>Yangi mahsulot va qoldiq Kirimlar orqali qo‘shiladi.</p>
            </div>
            <Link className="pc-btn pc-btn-primary" to="/procurements">
              <Plus size={17} />
              Kirim qo‘shish
            </Link>
          </div>
          {searchField}
          {catalogStatus}
          {!catalogStatus && (
            <div className="pc-catalog">
              {filteredProducts.map((p) => (
                <div className="pc-catalog-row" key={p.id}>
                  <span className="pc-product-icon">
                    <Package size={19} />
                  </span>
                  <div className="pc-product-copy">
                    <strong>{p.name}</strong>
                    <span>
                      Qoldiq: {number(p.quantity)} {p.unit}
                    </span>
                  </div>
                  <div className="pc-catalog-price">
                    <strong>
                      {money(p.buyPrice)} <small>so‘m</small>
                    </strong>
                    <span>1 {p.unit} uchun</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="pc-workspace">
            <form
              ref={formRef}
              onSubmit={add}
              className="pc-panel pc-form"
              aria-label="Kirim mahsuloti"
            >
              <div className="pc-panel-heading">
                <div>
                  <h2>
                    <span className="pc-step">1</span>
                    {editing === null
                      ? 'Mahsulot qo‘shish'
                      : 'Mahsulotni tahrirlash'}
                  </h2>
                  <p>Mahsulot, miqdor va xarid narxini kiriting.</p>
                </div>
                {editing !== null && (
                  <button
                    type="button"
                    className="pc-icon-btn"
                    onClick={resetForm}
                    disabled={locked}
                    aria-label="Tahrirlashni bekor qilish"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <div className="pc-segments" aria-label="Mahsulot turi">
                <button
                  type="button"
                  aria-pressed={mode === 'catalog'}
                  className={mode === 'catalog' ? 'is-active' : ''}
                  disabled={locked || editing !== null}
                  onClick={() => switchMode('catalog')}
                >
                  <Package size={16} />
                  Mavjud mahsulot
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'new'}
                  className={mode === 'new' ? 'is-active' : ''}
                  disabled={locked || editing !== null}
                  onClick={() => switchMode('new')}
                >
                  <Plus size={16} />
                  Yangi mahsulot
                </button>
              </div>
              {mode === 'catalog' ? (
                <>
                  {editing === null && (
                    <>
                      {searchField}
                      {catalogStatus}
                      {!catalogStatus && (
                        <div className="pc-picker" aria-label="Mahsulotlar">
                          {filteredProducts.map((p) => (
                            <button
                              type="button"
                              key={p.id}
                              className={`pc-picker-row${productId === p.id ? ' is-selected' : ''}`}
                              disabled={locked}
                              aria-pressed={productId === p.id}
                              onClick={() => choose(p)}
                            >
                              <span className="pc-product-icon">
                                <Package size={18} />
                              </span>
                              <span className="pc-product-copy">
                                <strong>{p.name}</strong>
                                <span>
                                  {number(p.quantity)} {p.unit} qoldiq ·{' '}
                                  {money(p.buyPrice)} so‘m
                                </span>
                              </span>
                              {productId === p.id && (
                                <Check
                                  size={18}
                                  className="pc-selected-check"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {productId && (
                    <div className="pc-selection">
                      <CheckCircle2 size={17} />
                      <span>
                        <strong>{name}</strong>
                        <small>Tanlangan mahsulot · {unit}</small>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <label className="pc-field">
                  Mahsulot nomi
                  <input
                    required
                    maxLength={200}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        quantityRef.current?.focus()
                      }
                    }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={locked}
                    placeholder="Masalan, Olma Golden"
                    autoComplete="off"
                  />
                </label>
              )}
              <div className="pc-fields-row">
                <label className="pc-field">
                  Miqdor
                  <div className="pc-input-unit">
                    <input
                      ref={quantityRef}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          priceRef.current?.focus()
                        }
                      }}
                      required
                      type="number"
                      inputMode={unit === 'kg' ? 'decimal' : 'numeric'}
                      min={unit === 'kg' ? 0.001 : 1}
                      step={unit === 'kg' ? 0.001 : 1}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      disabled={locked}
                    />
                    <span>{unit}</span>
                  </div>
                </label>
                <div className="pc-field">
                  <span>O‘lchov birligi</span>
                  <div className="pc-units">
                    {(['dona', 'kg'] as const).map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={unit === value}
                        className={unit === value ? 'is-active' : ''}
                        disabled={locked || !!productId}
                        onClick={() => {
                          setUnit(value)
                          setQuantity('1')
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="pc-field">
                Xarid narxi{' '}
                <span className="pc-field-hint">1 {unit} uchun</span>
                <div className="pc-input-unit">
                  <input
                    required
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    ref={priceRef}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={locked}
                    placeholder="0"
                  />
                  <span>so‘m</span>
                </div>
              </label>
              {!!productId && (
                <PriceAlert
                  previous={
                    products.find((p) => p.id === productId)?.buyPrice ?? 0
                  }
                  next={price}
                />
              )}
              <div className="pc-line-total">
                <span>Ushbu mahsulot summasi</span>
                <strong>
                  {money(
                    Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : 0,
                  )}{' '}
                  <small>so‘m</small>
                </strong>
              </div>
              <button
                className="pc-btn pc-btn-primary pc-full"
                type="submit"
                disabled={locked || (mode === 'catalog' && !productId)}
              >
                {busy === 'save' ? (
                  <Loader2 className="pc-spin" size={18} />
                ) : editing === null ? (
                  <Plus size={18} />
                ) : (
                  <Check size={18} />
                )}
                {busy === 'save'
                  ? 'Saqlanmoqda…'
                  : editing === null
                    ? 'Savatga qo‘shish'
                    : 'O‘zgarishni saqlash'}
              </button>
              {editing !== null && (
                <button
                  type="button"
                  className="pc-btn pc-btn-secondary pc-full"
                  disabled={locked}
                  onClick={resetForm}
                >
                  Tahrirlashni bekor qilish
                </button>
              )}
            </form>
            <aside className="pc-panel pc-cart" aria-label="Kirim savati">
              <div className="pc-panel-heading">
                <div>
                  <h2>
                    <span className="pc-step">2</span>Kirim savati{' '}
                    <span className="pc-count">{items.length}</span>
                  </h2>
                  <p>
                    {pending
                      ? 'Yuborilgan kirim tasdig‘i kutilmoqda'
                      : 'Tasdiqlashdan oldin savatni tekshiring'}
                  </p>
                </div>
                <ShoppingBag size={22} className="pc-muted" />
              </div>
              {!ready ? (
                <div className="pc-empty" role="status">
                  <Loader2 className="pc-spin" size={28} />
                  <p>Savat yuklanmoqda…</p>
                  {error && (
                    <button
                      type="button"
                      className="pc-btn pc-btn-secondary"
                      onClick={() => void loadDraft()}
                    >
                      Qayta urinish
                    </button>
                  )}
                </div>
              ) : !items.length ? (
                <div className="pc-empty pc-cart-empty">
                  <span className="pc-empty-icon">
                    <ShoppingBag size={30} />
                  </span>
                  <strong>Savat hozircha bo‘sh</strong>
                  <p>
                    Mahsulotlarni qo‘shing.
                    <br />
                    Hammasi bitta kirim sifatida saqlanadi.
                  </p>
                </div>
              ) : (
                <ul className="pc-cart-list">
                  {items.map((item, i) => (
                    <li
                      className={`pc-cart-row${editing === i ? ' is-editing' : ''}`}
                      key={i}
                    >
                      <div className="pc-cart-item">
                        <strong>{item.name}</strong>
                        <span>
                          {number(item.quantity)} {item.unit} ×{' '}
                          {money(item.buyPrice)} so‘m
                          {!item.productId && (
                            <small className="pc-new-badge">Yangi</small>
                          )}
                        </span>
                      </div>
                      <div className="pc-cart-row-bottom">
                        <strong>
                          {money(item.quantity * item.buyPrice)}{' '}
                          <small>so‘m</small>
                        </strong>
                        <div className="pc-row-actions">
                          <button
                            type="button"
                            className="pc-icon-btn"
                            aria-label={`${item.name}ni tahrirlash`}
                            title="Tahrirlash"
                            disabled={locked}
                            onClick={() => edit(i)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="pc-icon-btn pc-remove"
                            aria-label={`${item.name}ni savatdan olib tashlash`}
                            title="Olib tashlash"
                            disabled={locked}
                            onClick={() => void remove(i)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pc-cart-footer">
                {pending && (
                  <div className="pc-pending" role="status">
                    <Clock3 size={18} />
                    <span>
                      Tasdiq kutilmoqda. Qayta tekshirish shu kirimni davom
                      ettiradi.
                    </span>
                  </div>
                )}
                <div className="pc-grand-total">
                  <div>
                    <span>Jami kirim summasi</span>
                    <small>{items.length} ta mahsulot</small>
                  </div>
                  <strong>
                    {money(total)} <small>so‘m</small>
                  </strong>
                </div>
                <button
                  type="button"
                  className="pc-btn pc-btn-primary pc-full pc-confirm"
                  onClick={() => void confirm()}
                  disabled={
                    !ready || !!busy || !items.length || editing !== null
                  }
                >
                  {busy === 'confirm' ? (
                    <Loader2 className="pc-spin" size={18} />
                  ) : pending ? (
                    <RefreshCw size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  {busy === 'confirm'
                    ? 'Tasdiqlanmoqda…'
                    : pending
                      ? 'Tasdiqni qayta tekshirish'
                      : 'Kirimni tasdiqlash'}
                </button>
                <p className="pc-save-note">
                  {editing !== null
                    ? 'Avval tahrirni saqlang yoki bekor qiling.'
                    : pending
                      ? 'Kirim tasdiqlanguncha savat o‘zgarmaydi.'
                      : items.length
                        ? 'Savat saqlangan. Qoldiq tasdiqlashdan keyin yangilanadi.'
                        : 'Savatga kamida bitta mahsulot qo‘shing.'}
                </p>
              </div>
            </aside>
          </div>
          <ProcurementHistory
            initial={history}
            products={products}
            error={historyError}
            loading={loading}
          />
          {!!items.length && (
            <div className="pi-dock">
              <div>
                <strong>{money(total)} so‘m</strong>
                <small>
                  {procurementQuantity(items).dona} dona ·{' '}
                  {procurementQuantity(items).kg} kg · {items.length} tur
                </small>
              </div>
              <button
                type="button"
                className="pi-button pi-primary"
                disabled={!ready || !!busy || editing !== null}
                onClick={() => void confirm()}
              >
                {busy === 'confirm'
                  ? 'Tasdiqlanmoqda…'
                  : pending
                    ? 'Tasdiqni tekshirish'
                    : 'Partiyani tasdiqlash'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
