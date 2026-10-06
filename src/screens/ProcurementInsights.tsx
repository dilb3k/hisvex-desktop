'use client'
import { QuantityStack } from '../components/QuantityStack'
import { formatQuantity } from '../utils/inventory'
import { useEffect, useRef, useState } from 'react'
import { procurementApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import {
  procurementMoney as money,
  priceChange,
  type ProcurementAnalytics as Analytics,
  type ProcurementQuery,
  type ProcurementPeriod,
  type ProcurementReceipt,
  type ProcurementSummary,
  type ProcurementCatalogProduct as Product,
} from '../utils/procurementTypes'
import type { ProcurementItem } from '../utils/procurementIntent'
import './procurementInsights.css'

export function ProcurementKpis({ revision }: { revision: unknown }) {
  const identity = useAuthStore((s) => s.token)
  const [data, setData] = useState<ProcurementSummary | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    procurementApi
      .summary()
      .then((v) => {
        if (alive) setData(v)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [revision, identity])
  return (
    <div className="pi-kpis" aria-live="polite">
      {([
        [
          'Bugungi kirim',
          data ? money(data.todaySpend) + ' so‘m' : error ? 'Yuklanmadi' : '…',
        ],
        [
          'Shu oydagi xarid',
          data ? money(data.monthSpend) + ' so‘m' : error ? 'Yuklanmadi' : '…',
        ],
        [
          'Oxirgi partiya',
          data
            ? data.lastBatch
              ? <QuantityStack quantities={data.lastBatch.quantities} />
              : 'Hali kirim yo‘q'
            : error
              ? 'Yuklanmadi'
              : '…',
        ],
      ] as const).map(([title, value]) => (
        <div className="pi-kpi" key={title}>
          <span>{title}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}
export function PriceAlert({
  previous,
  next,
}: {
  previous: number
  next: string
}) {
  const change = next.trim() ? priceChange(previous, Number(next)) : null
  if (change === null || change === 0) return null
  return (
    <p role="status" className={`pi-price ${change > 0 ? 'pi-up' : 'pi-down'}`}>
      {change > 0 ? '+' : ''}
      {change}% {change > 0 ? 'qimmatlashgan' : 'arzonlashgan'} · oldingi narx{' '}
      {money(previous)} so‘m
    </p>
  )
}
export function ProcurementTools({
  products,
  locked,
  supplier,
  onSupplier,
  onChoose,
  onAdd,
  focusRevision,
}: {
  products: Product[]
  locked: boolean
  supplier: string
  onSupplier: (v: string) => void
  onChoose: (p: Product) => void
  onAdd: (item: ProcurementItem) => Promise<void>
  focusRevision?: unknown
}) {
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [modal, setModal] = useState(false)
  const [name, setName] = useState(''),
    [unit, setUnit] = useState<'dona' | 'kg'>('dona'),
    [quantity, setQuantity] = useState('1'),
    [price, setPrice] = useState(''),
    [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null),
    scanRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (modal) dialog.current?.showModal()
    else dialog.current?.close()
  }, [modal])
  useEffect(() => {
    if (!locked && !modal) scanRef.current?.focus()
  }, [focusRevision, locked, modal])
  const scan = () => {
    const p = products.find((p) => p.barcodes?.includes(code.trim()))
    if (p) {
      onChoose(p)
      setCode('')
      setError('')
    } else {
      setError(
        'Shtrix-kod topilmadi. Yangi mahsulotni shu kod bilan qo‘shishingiz mumkin.',
      )
    }
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || locked) return
    setSaving(true)
    setError('')
    try {
      await onAdd({
        name: name.trim(),
        unit,
        quantity: Number(quantity),
        buyPrice: Number(price),
        ...(code.trim() ? { barcodes: [code.trim()] } : {}),
      })
      setModal(false)
      setName('')
      setPrice('')
      setQuantity('1')
      setCode('')
      scanRef.current?.focus()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="pi-tools">
      <label>
        Yetkazib beruvchi{' '}
        <input
          aria-label="Yetkazib beruvchi"
          maxLength={120}
          value={supplier}
          disabled={locked}
          onChange={(e) => onSupplier(e.target.value)}
          placeholder="Ixtiyoriy · masalan, Chorsu"
        />
      </label>
      <label>
        Shtrix-kod / USB skaner{' '}
        <input
          ref={scanRef}
          aria-label="Kirim shtrix-kodi"
          maxLength={128}
          value={code}
          disabled={locked}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              scan()
            }
          }}
          placeholder="Skanerlang va Enter bosing"
        />
      </label>
      <button
        type="button"
        className="pi-button"
        disabled={locked}
        onClick={scan}
      >
        Topish
      </button>
      <button
        type="button"
        className="pi-button pi-primary"
        disabled={locked}
        onClick={() => {
          setError('')
          setModal(true)
        }}
      >
        + Yangi mahsulot
      </button>
      {!!error && (
        <p role="alert" className="pi-error">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="pi-dialog"
        onCancel={(e) => {
          if (saving) {
            e.preventDefault()
            return
          }
          setModal(false)
        }}
        onClose={() => setModal(false)}
        aria-labelledby="pi-new-title"
      >
        <form onSubmit={add}>
          <h2 id="pi-new-title">Yangi mahsulotni savatga qo‘shish</h2>
          <p>Mahsulot partiya tasdiqlanganda yaratiladi.</p>
          <label>
            Nomi
            <input
              autoFocus
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Birligi
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'dona' | 'kg')}
              disabled={saving}
            >
              <option>dona</option>
              <option>kg</option>
            </select>
          </label>
          <label>
            Miqdor
            <input
              required
              type="number"
              min={unit === 'kg' ? 0.001 : 1}
              step={unit === 'kg' ? 0.001 : 1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Xarid narxi
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Shtrix-kod
            <input
              maxLength={128}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={saving}
            />
          </label>
          {!!error && (
            <p role="alert" className="pi-error">
              {error}
            </p>
          )}
          <div className="pi-actions">
            <button
              type="button"
              className="pi-button"
              disabled={saving}
              onClick={() => setModal(false)}
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="pi-button pi-primary"
              disabled={saving}
            >
              {saving ? 'Saqlanmoqda…' : 'Savatga qo‘shish'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
export function ProcurementHistory({
  initial,
  products,
  error: initialError,
  loading,
}: {
  initial: ProcurementReceipt[]
  products: Product[]
  error: string
  loading: boolean
}) {
  const identity = useAuthStore((s) => s.token)
  const [rows, setRows] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(''),
    [print, setPrint] = useState<ProcurementReceipt | null>(null)
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [supplier, setSupplier] = useState(''),
    [product, setProduct] = useState(''),
    [query, setQuery] = useState({
      from: '',
      to: '',
      supplier: '',
      product: '',
    }),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    setRows(initial)
    setOpen('')
  }, [initial, identity])
  useEffect(() => {
    let alive = true
    setError('')
    setBusy(true)
    procurementApi
      .list({
        ...query,
        from: query.from || undefined,
        to: query.to || undefined,
        supplier: query.supplier || undefined,
        product: query.product || undefined,
        page,
        limit: 50,
      })
      .then((v) => {
        if (alive) setRows(v)
      })
      .catch(() => {
        if (alive) setError('Tarix yuklanmadi. Qayta urinib ko‘ring.')
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [query, page, identity, revision, initial])
  useEffect(() => {
    if (!print) return
    const timer = setTimeout(() => window.print(), 100)
    const clear = () => setPrint(null)
    window.addEventListener('afterprint', clear)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', clear)
    }
  }, [print])
  const details = (r: ProcurementReceipt) => (
    <div className="pi-detail">
      <p>
        {r.createdAt ? new Date(r.createdAt).toLocaleString('uz-UZ') : r.date} ·{' '}
        {r.createdByUsername ? r.createdByUsername + ' · ' : ''}
        {r.createdByScope === 'procurement' ? 'Bozorchi' : 'Administrator'} · ID{' '}
        {r.createdByUserId ?? '—'}
      </p>
      <p>Yetkazib beruvchi: {r.supplier || 'Ko‘rsatilmagan'}</p>
      <div className="pi-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mahsulot</th>
              <th>Miqdor</th>
              <th>Xarid narxi</th>
              <th>Summa</th>
            </tr>
          </thead>
          <tbody>
            {r.items?.map((i, n) => (
              <tr key={n}>
                <td>{i.name}</td>
                <td>
                  {formatQuantity(i.quantity, i.unit)}
                </td>
                <td>{money(i.buyPrice)}</td>
                <td>{money(i.lineCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <strong>Jami: {money(r.totalCost)} so‘m</strong>
    </div>
  )
  return (
    <section className="pi-section" aria-label="Kirimlar tarixi">
      <h2>Kirimlar tarixi</h2>
      <p className="pi-muted">
        Server tasdiqlagan partiyalar · tarkibini ko‘rish uchun oching
      </p>
      <form
        className="pi-filters"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setQuery({ from, to, supplier: supplier.trim(), product })
          setRevision((v) => v + 1)
        }}
      >
        <label>
          Boshlanish
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Tugash
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Yetkazib beruvchi
          <input
            maxLength={120}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Aniq nomi"
          />
        </label>
        <label>
          Mahsulot
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Barchasi</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="pi-button" disabled={busy}>
          Filtrlash / yangilash
        </button>
      </form>
      {(error || initialError) && (
        <p role="alert" className="pi-error">
          {error || initialError}
        </p>
      )}
      {(busy || loading) && (
        <p role="status" className="pi-muted">
          Yuklanmoqda…
        </p>
      )}
      {!rows.length && !busy && !error && !initialError && (
        <p className="pi-muted">Bu davrda kirim yo‘q.</p>
      )}
      {rows.map((r) => (
        <article className="pi-batch" key={r.localId}>
          <button
            type="button"
            className="pi-batch-toggle"
            aria-expanded={open === r.localId}
            onClick={() => setOpen(open === r.localId ? '' : r.localId)}
          >
            <span>
              <strong>{r.date}</strong>
              <small>
                {r.supplier || 'Yetkazib beruvchi ko‘rsatilmagan'} ·{' '}
                {r.items?.length ?? 0} tur
              </small>
            </span>
            <strong>
              {money(r.totalCost)} so‘m {open === r.localId ? '−' : '+'}
            </strong>
          </button>
          {open === r.localId && (
            <>
              {details(r)}
              <button
                type="button"
                className="pi-button"
                onClick={() => setPrint(r)}
              >
                Chekni chop etish
              </button>
            </>
          )}
        </article>
      ))}
      <div className="pi-actions">
        <button
          className="pi-button"
          disabled={page === 1 || busy}
          onClick={() => setPage((v) => v - 1)}
        >
          ← Oldingi
        </button>
        <span>{page}-sahifa</span>
        <button
          className="pi-button"
          disabled={rows.length < 50 || busy}
          onClick={() => setPage((v) => v + 1)}
        >
          Keyingi →
        </button>
      </div>
      {print && (
        <div className="pi-print">
          <h2>HISVEX · Kirim cheki</h2>
          <p>
            Partiya: {print.localId} · {print.date}
          </p>
          {details(print)}
        </div>
      )}
    </section>
  )
}
export function ProcurementAnalytics({
  from,
  to,
  refreshKey,
}: {
  from: string
  to: string
  refreshKey?: unknown
}) {
  const user = useAuthStore((s) => s.user),
    identity = useAuthStore((s) => s.token)
  const allowed =
    !!user && user.scope !== 'procurement' && user.tier !== 'tekin'
  const [period, setPeriod] = useState<ProcurementPeriod>('custom'),
    [supplier, setSupplier] = useState(''),
    [start, setStart] = useState(from),
    [end, setEnd] = useState(to)
  const [query, setQuery] = useState<ProcurementQuery>({
      period: 'custom',
      from,
      to,
    }),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState('')
  useEffect(() => {
    setStart(from)
    setEnd(to)
    setPeriod('custom')
    setQuery({ period: 'custom', from, to })
  }, [from, to, identity])
  useEffect(() => {
    if (!allowed) return
    let alive = true
    setData(null)
    setError('')
    setBusy(true)
    procurementApi
      .analytics(query)
      .then((v) => {
        if (alive) setData(v)
      })
      .catch(() => {
        if (alive)
          setError(
            'Kirimlar tahlili yuklanmadi. Internetni tekshiring va qayta urinib ko‘ring.',
          )
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [query, refreshKey, identity, allowed, revision])
  const download = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (exporting || !data) return
    setExporting(format)
    setError('')
    try {
      const body = await procurementApi.export(query, format)
      if (useAuthStore.getState().token !== identity) return
      const mime = {
        csv: 'text/csv;charset=utf-8',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      }[format]
      const url = URL.createObjectURL(new Blob([body], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `kirimlar-${data.from}-${data.to}.${format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('Eksport bajarilmadi. Qayta urinib ko‘ring.')
    } finally {
      if (useAuthStore.getState().token === identity) setExporting('')
    }
  }
  if (!allowed) return null
  const max = Math.max(
    1,
    ...(data?.costTrends ?? []).flatMap((v) => [v.spend, v.revenue]),
  )
  return (
    <section
      className="pi-section pi-analytics"
      aria-label="Ta’minot va Kirimlar Tahlili"
    >
      <div className="pi-heading">
        <div>
          <h2>Ta’minot va Kirimlar Tahlili</h2>
          <p className="pi-muted">Savdo, xarid va qoldiq tannarxi bir joyda</p>
        </div>
        <div className="pi-actions">
          {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
            <button
              className="pi-button"
              key={f}
              disabled={!data || !!exporting}
              onClick={() => void download(f)}
            >
              {exporting === f ? '…' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <form
        className="pi-filters"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery({
            period,
            from: start,
            to: period === 'custom' ? end : undefined,
            supplier: supplier.trim() || undefined,
          })
          setRevision((v) => v + 1)
        }}
      >
        <label>
          Davr
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ProcurementPeriod)}
          >
            {[
              ['day', 'Kun'],
              ['week', 'Hafta'],
              ['month', 'Oy'],
              ['year', 'Yil'],
              ['custom', 'Tanlangan davr'],
            ].map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          {period === 'custom' ? 'Boshlanish' : 'Davr sanasi'}
          <input
            required
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        {period === 'custom' && (
          <label>
            Tugash
            <input
              required
              type="date"
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
        <label>
          Yetkazib beruvchi
          <input
            maxLength={120}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Barchasi"
          />
        </label>
        <button className="pi-button" disabled={busy}>
          Ko‘rsatish / yangilash
        </button>
      </form>
      {!!error && (
        <p role="alert" className="pi-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Tahlil yuklanmoqda…</p>}
      {data && (
        <>
          <p className="pi-muted">
            {data.from} — {data.to} · <QuantityStack quantities={data.totalItemsProcured} />
          </p>
          <div className="pi-kpis">
            {[
              [
                'Kirim xarajatlari',
                money(data.totalProcurementSpend) + ' so‘m',
              ],
              ['Partiyalar', String(data.totalBatchesCount)],
              ['O‘rtacha partiya', money(data.averageBatchValue) + ' so‘m'],
              ['Joriy qoldiq tannarxi', money(data.inventoryValue) + ' so‘m'],
            ].map(([l, v]) => (
              <div className="pi-kpi" key={l}>
                <span>{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="pi-balance">
            {[
              ['Savdo', data.totalRevenue],
              ['Sotilgan tovar tannarxi', data.costOfGoodsSold],
              ['Yalpi foyda', data.grossProfit],
              ['Savdo − kirim balansi', data.cashFlowBalance],
            ].map(([l, v]) => (
              <div key={l}>
                <span>{l}</span>
                <strong>{money(Number(v))} so‘m</strong>
              </div>
            ))}
          </div>
          <p className="pi-muted">
            Savdo qarzga sotuvlarni ham o‘z ichiga oladi; balans kassadagi naqd
            pul emas. Qoldiq joriy oxirgi xarid narxida baholanadi.{' '}
            {data.supplier
              ? 'Yetkazib beruvchi filtri faqat kirimlarga tegishli; savdo va qoldiq butun do‘kon bo‘yicha.'
              : ''}
          </p>
          <h3>
            Kirimlar dinamikasi{' '}
            <small className="pi-muted"> · xarid / savdo</small>
          </h3>
          <div
            className="pi-chart"
            role="img"
            aria-label="Kunlik yoki oylik xarid va savdo dinamikasi"
          >
            {data.costTrends.map((v) => (
              <div
                className="pi-chart-column"
                key={v.date}
                title={`${v.date}: kirim ${money(v.spend)}, savdo ${money(v.revenue)}`}
              >
                <div className="pi-bars">
                  <span style={{ height: `${(v.spend / max) * 100}%` }} />
                  <span style={{ height: `${(v.revenue / max) * 100}%` }} />
                </div>
                <small>{v.date.slice(5)}</small>
                <small>{money(v.spend)}</small>
              </div>
            ))}
          </div>
          <p className="pi-muted">
            ● Ko‘k — kirim · ● Yashil — savdo. Ustun ustida sana va summalar
            ko‘rinadi.
          </p>
          <h3>Kapital eng ko‘p sarflangan tovarlar</h3>
          <div className="pi-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mahsulot</th>
                  <th>Miqdor</th>
                  <th>Sarflangan kapital</th>
                  <th>O‘rtacha xarid</th>
                  <th>Oxirgi narx / o‘zgarish</th>
                </tr>
              </thead>
              <tbody>
                {data.topCostProducts.map((p) => (
                  <tr key={p.productId + ':' + p.unit}>
                    <td>{p.name}</td>
                    <td>
                      {formatQuantity(p.quantity, p.unit)}
                    </td>
                    <td>{money(p.totalCost)}</td>
                    <td>{money(p.averageBuyPrice)}</td>
                    <td>
                      {money(p.latestBuyPrice)}{' '}
                      <span
                        className={
                          p.priceChangePercent !== null &&
                          p.priceChangePercent > 0
                            ? 'pi-up'
                            : 'pi-down'
                        }
                      >
                        {p.priceChangePercent === null
                          ? '—'
                          : `${p.priceChangePercent > 0 ? '+' : ''}${p.priceChangePercent}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.topCostProducts.length && (
              <p className="pi-muted">Bu davrda kirim yo‘q.</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
