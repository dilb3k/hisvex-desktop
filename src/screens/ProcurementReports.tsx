'use client'

import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { ArrowDownToLine, ChevronDown, ChevronLeft, ChevronRight, PackageCheck, RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import { clearApiCache, procurementApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { getBusinessDate } from '../utils/businessDay'
import { formatDecimal, formatInputMoney, formatTruncatedDecimal } from '../utils/quantities'
import type { ProcurementAnalytics, ProcurementReceipt } from '../utils/procurementTypes'
import './procurementReports.css'

type Preset = 'today' | 'week' | 'month' | 'custom'
type Selection = { from: string; to: string; supplier: string }
type Result<T> = { key: string; value?: T; failed?: boolean }
const PAGE_SIZE = 20
const money = (value: number) => formatInputMoney(formatDecimal(value))
const dateLabel = (date: string) => date.split('-').reverse().join('.')
const rangeLabel = ({ from, to }: Selection) => from === to ? dateLabel(from) : `${dateLabel(from)} — ${dateLabel(to)}`

export function ReceiptDetails({ receipt }: { receipt: ProcurementReceipt }) {
  return <div className="pr-receipt-details">
    {receipt.createdByUsername && <p className="pr-muted">Kiritgan: {receipt.createdByUsername}</p>}
    <div className="pr-table-scroll">
      <table>
        <caption className="pr-sr-only">Kirimdagi mahsulotlar</caption>
        <thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Xarid narxi</th><th>Jami</th></tr></thead>
        <tbody>{receipt.items?.map((item, index) => <tr key={`${item.productId}-${index}`}>
          <td>{item.name}</td>
          <td>{formatTruncatedDecimal(item.quantity)} {item.unit}</td>
          <td>{money(item.buyPrice)} <small>so‘m</small></td>
          <td>{money(item.lineCost)} <small>so‘m</small></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="pr-receipt-total"><span>Jami xarid summasi</span><strong>{money(receipt.totalCost)} so‘m</strong></div>
  </div>
}

// A new account gets fresh filters, results, expanded rows and export state.
export function ProcurementReports(props: { from: string; to: string }) {
  const identity = useAuthStore(s => s.token)
  return <ProcurementReportScreen key={identity} {...props} />
}

export function ProcurementReportScreen({ from, to }: { from: string; to: string }) {
  const identity = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const canAnalyze = !!user && user.scope !== 'procurement' && user.tier !== 'tekin'
  const [selection, setSelection] = useState<Selection>({ from, to, supplier: '' })
  const [preset, setPreset] = useState<Preset>(from === getBusinessDate() && to === from ? 'today' : 'custom')
  const [draft, setDraft] = useState<Selection>({ from, to, supplier: '' })
  const [showSupplier, setShowSupplier] = useState(false)
  const [filterError, setFilterError] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [summary, setSummary] = useState<Result<ProcurementAnalytics> | null>(null)
  const [receipts, setReceipts] = useState<Result<ProcurementReceipt[]> | null>(null)
  const [open, setOpen] = useState('')
  const [printing, setPrinting] = useState<ProcurementReceipt | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const exportBusy = useRef(false)
  const queryKey = JSON.stringify([identity, selection, revision])
  const listKey = `${queryKey}:${page}`
  const summaryResult = summary?.key === queryKey ? summary : null
  const listResult = receipts?.key === listKey ? receipts : null
  const totals = summaryResult?.value
  const rows = listResult?.value ?? []
  const loading = !listResult
  const hasNext = totals ? page * PAGE_SIZE < totals.totalBatchesCount : rows.length === PAGE_SIZE

  useEffect(() => {
    if (!identity) return
    let active = true
    procurementApi.list({ ...selection, supplier: selection.supplier || undefined, page, limit: PAGE_SIZE })
      .then(value => { if (active) setReceipts({ key: listKey, value }) })
      .catch(() => { if (active) setReceipts({ key: listKey, failed: true }) })
    return () => { active = false }
  }, [identity, selection, page, listKey])

  useEffect(() => {
    if (!identity || !canAnalyze) return
    let active = true
    procurementApi.analytics({ period: 'custom', ...selection, supplier: selection.supplier || undefined })
      .then(value => { if (active) setSummary({ key: queryKey, value }) })
      .catch(() => { if (active) setSummary({ key: queryKey, failed: true }) })
    return () => { active = false }
  }, [identity, canAnalyze, selection, queryKey])

  useEffect(() => {
    if (!printing) return
    const timer = setTimeout(() => window.print(), 100)
    const clear = () => setPrinting(null)
    window.addEventListener('afterprint', clear)
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', clear) }
  }, [printing])

  const apply = (next: Selection) => {
    setSelection(next)
    setPage(1)
    setOpen('')
    setFilterError('')
    setExportError('')
  }
  const choosePreset = (next: Preset) => {
    setPreset(next)
    setFilterError('')
    if (next === 'custom') { if (preset !== 'custom') setDraft(selection); return }
    const today = getBusinessDate()
    const start = next === 'week' ? dayjs(today).subtract(6, 'day').format('YYYY-MM-DD') : next === 'month' ? dayjs(today).startOf('month').format('YYYY-MM-DD') : today
    const value = { ...selection, from: start, to: today }
    setDraft(value)
    apply(value)
  }
  const refresh = () => { clearApiCache(); setRevision(value => value + 1); setOpen(''); setExportError('') }
  const download = async () => {
    if (!canAnalyze || exportBusy.current || loading || !rows.length) return
    exportBusy.current = true
    setExporting(true)
    setExportError('')
    try {
      const body = await procurementApi.export({ period: 'custom', ...selection, supplier: selection.supplier || undefined, report: 'receipts' }, 'xlsx')
      if (useAuthStore.getState().token !== identity) return
      if (window.electronAPI?.saveXlsx) {
        await window.electronAPI.saveXlsx(`kirimlar-${selection.from}-${selection.to}.xlsx`, new Uint8Array(body))
        return
      }
      const url = URL.createObjectURL(new Blob([body], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kirimlar-${selection.from}-${selection.to}.xlsx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      if (useAuthStore.getState().token === identity) setExportError('Hisobot yuklab olinmadi. Qayta urinib ko‘ring.')
    } finally {
      exportBusy.current = false
      if (useAuthStore.getState().token === identity) setExporting(false)
    }
  }

  return <div className="pr-page">
    <header className="pr-header">
      <div><h1>Kirimlar statistikasi</h1><p>Xaridlar summasi va tasdiqlangan kirimlar.</p></div>
      {canAnalyze && <button className="pr-button pr-export" onClick={() => void download()} disabled={loading || !rows.length || exporting}>
        <ArrowDownToLine size={16} aria-hidden="true" />{exporting ? 'Yuklanmoqda…' : 'Excel yuklab olish'}
      </button>}
    </header>

    <section className="pr-filters" aria-label="Kirimlar filtri">
      <form onSubmit={event => {
        event.preventDefault()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.from) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.to) || dayjs(draft.from).format('YYYY-MM-DD') !== draft.from || dayjs(draft.to).format('YYYY-MM-DD') !== draft.to || draft.from > draft.to) {
          setFilterError('Boshlanish sanasi tugash sanasidan keyin bo‘lmasin.'); return
        }
        apply({ ...draft, supplier: draft.supplier.trim() })
      }}>
        <div className="pr-filter-top">
          <div className="pr-presets" role="group" aria-label="Kirimlar davri">
            {([['today', 'Bugun'], ['week', '7 kun'], ['month', 'Shu oy'], ['custom', 'Sana tanlash']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={preset === value} onClick={() => choosePreset(value)}>{label}</button>)}
          </div>
          <button type="button" className="pr-button pr-filter-toggle" aria-expanded={showSupplier} aria-controls="pr-supplier-filter" onClick={() => setShowSupplier(value => !value)}><SlidersHorizontal size={15} aria-hidden="true" />Yetkazib beruvchi</button>
        </div>
        {(preset === 'custom' || showSupplier) && <div className="pr-filter-fields">
          {preset === 'custom' && <>
            <label>Boshlanish sanasi<input required type="date" value={draft.from} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} /></label>
            <label>Tugash sanasi<input required type="date" min={draft.from} value={draft.to} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} /></label>
          </>}
          {showSupplier && <label id="pr-supplier-filter">Yetkazib beruvchi<input maxLength={120} value={draft.supplier} onChange={event => setDraft(value => ({ ...value, supplier: event.target.value }))} placeholder="To‘liq nomini kiriting" /></label>}
          <button className="pr-button pr-primary" type="submit">Ko‘rsatish</button>
        </div>}
        {filterError && <p role="alert" className="pr-error">{filterError}</p>}
      </form>
      <div className="pr-active-filter"><span>{rangeLabel(selection)}</span>{selection.supplier && <button type="button" className="pr-supplier-chip" aria-label="Yetkazib beruvchi filtrini olib tashlash" onClick={() => { const value = { ...selection, supplier: '' }; setDraft(value); apply(value) }}>{selection.supplier}<X size={13} aria-hidden="true" /></button>}</div>
    </section>

    {canAnalyze && <section aria-label="Kirimlar yakuni" className="pr-summary" aria-busy={!summaryResult}>
      {summaryResult?.failed ? <div role="alert" className="pr-summary-error"><span>Jami ko‘rsatkichlar yuklanmadi.</span><button type="button" className="pr-button" onClick={refresh}>Qayta urinish</button></div> : <>
        <div className="pr-metric pr-metric-main"><span>Jami xarid summasi</span>{totals ? <strong>{money(totals.totalProcurementSpend)} <small>so‘m</small></strong> : <div className="pr-skeleton pr-metric-skeleton" />}<p>Tanlangan davr uchun</p></div>
        <div className="pr-metric"><span>Kirimlar soni</span>{totals ? <strong>{totals.totalBatchesCount}</strong> : <div className="pr-skeleton pr-metric-skeleton" />}<p>Tasdiqlangan kirimlar</p></div>
        <div className="pr-metric"><span>Keltirilgan miqdor</span>{totals ? <div className="pr-quantities"><strong>{formatTruncatedDecimal(totals.totalItemsProcured.dona)} <small>dona</small></strong><strong>{formatTruncatedDecimal(totals.totalItemsProcured.kg)} <small>kg</small></strong></div> : <div className="pr-skeleton pr-metric-skeleton" />}<p>Dona va vazn alohida</p></div>
      </>}
    </section>}

    {exportError && <p role="alert" className="pr-error">{exportError}</p>}
    <section className="pr-ledger" aria-label="Kirimlar ro‘yxati" aria-busy={loading}>
      <div className="pr-ledger-heading"><div><h2>Kirimlar ro‘yxati</h2><p>Tarkibini ko‘rish uchun kirimni oching.</p></div><button className="pr-icon-button" aria-label="Kirimlarni yangilash" disabled={loading} onClick={refresh}><RefreshCw size={17} aria-hidden="true" /></button></div>
      {listResult?.failed ? <div className="pr-state" role="alert"><p>Kirimlar yuklanmadi. Qayta urinib ko‘ring.</p><button className="pr-button" onClick={refresh}>Qayta urinish</button></div> : loading ? <div role="status" aria-label="Kirimlar yuklanmoqda" className="pr-loading">{Array.from({ length: 4 }, (_, index) => <div className="pr-skeleton pr-row-skeleton" key={index} />)}</div> : !rows.length ? <div className="pr-state"><PackageCheck size={28} aria-hidden="true" /><h3>Bu davrda kirim yo‘q</h3><p>Boshqa sanani tanlab ko‘ring.</p>{preset !== 'month' && <button className="pr-button" onClick={() => choosePreset('month')}>Shu oyni ko‘rsatish</button>}</div> : <>
        <div className="pr-list-columns" aria-hidden="true"><span>Sana</span><span>Yetkazib beruvchi</span><span>Mahsulotlar</span><span>Jami summa</span><span /></div>
        <ul className="pr-receipts">{rows.map(receipt => <li key={receipt.localId}>
          <button className="pr-receipt" aria-expanded={open === receipt.localId} aria-controls={`pr-receipt-${encodeURIComponent(receipt.localId)}`} onClick={() => setOpen(value => value === receipt.localId ? '' : receipt.localId)}>
            <span className="pr-receipt-date">{dateLabel(receipt.date)}</span><span className="pr-receipt-supplier">{receipt.supplier || 'Ko‘rsatilmagan'}</span><span className="pr-receipt-count">{receipt.items?.length ?? 0} tur</span><strong className="pr-receipt-cost">{money(receipt.totalCost)} <small>so‘m</small></strong><ChevronDown className={open === receipt.localId ? 'pr-chevron pr-chevron-open' : 'pr-chevron'} size={16} aria-hidden="true" />
          </button>
          {open === receipt.localId && <div id={`pr-receipt-${encodeURIComponent(receipt.localId)}`} className="pr-expanded"><ReceiptDetails receipt={receipt} /><button className="pr-button" onClick={() => setPrinting(receipt)}>Chekni chop etish</button></div>}
        </li>)}</ul>
      </>}
      {(page > 1 || hasNext) && <nav className="pr-pagination" aria-label="Kirimlar sahifalari"><button className="pr-button" disabled={page === 1 || loading} onClick={() => { setPage(value => value - 1); setOpen('') }}><ChevronLeft size={15} aria-hidden="true" />Oldingi</button><span>{page}-sahifa</span><button className="pr-button" disabled={!hasNext || loading || !!listResult?.failed} onClick={() => { setPage(value => value + 1); setOpen('') }}>Keyingi<ChevronRight size={15} aria-hidden="true" /></button></nav>}
    </section>
    {printing && <div className="pr-print"><h1>Hisvex · Kirim cheki</h1><p>{dateLabel(printing.date)} · {printing.supplier || 'Yetkazib beruvchi ko‘rsatilmagan'}</p><ReceiptDetails receipt={printing} /></div>}
  </div>
}
