import { useEffect, useMemo, useState } from 'react'
import { createProcurementIntent, type ProcurementItem } from '../utils/procurementIntent'
import { procurementApi } from '../api/client'
import { useAuthStore } from '../store/authStore'

export function ProcurementScreen({ catalogOnly = false }: { catalogOnly?: boolean }) {
  const user = useAuthStore(s => s.user)
  const owner = user?._id ?? ''
  const identity = useAuthStore(s => s.token)
  const [products, setProducts] = useState<{id:string;name:string;unit:'kg'|'dona';quantity:number;buyPrice:number}[]>([])
  const [history, setHistory] = useState<{localId:string;date:string;totalCost:number}[]>([])
  const [items, setItems] = useState<ProcurementItem[]>([])
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [productId, setProductId] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<'dona'|'kg'>('dona')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const intent = useMemo(() => {
    const key = `hisvex_procurement:${owner}`
    return createProcurementIntent({
      read: async () => {
        const saved = localStorage.getItem(key); if (!saved) return null;
        const plain = await window.electronAPI?.safeStorageDecrypt(saved);
        if (!plain) throw Error('Saqlangan kirimni ochib bo‘lmadi'); return JSON.parse(plain);
      },
      write: async value => {
        const encrypted = await window.electronAPI?.safeStorageEncrypt(JSON.stringify(value));
        if (!encrypted) throw Error('Xavfsiz saqlash ishlamadi'); localStorage.setItem(key,encrypted);
      },
    }, () => crypto.randomUUID(), () => {
      if (useAuthStore.getState().token !== identity) throw Error('Sessiya o‘zgardi')
    })
  }, [owner, identity])
  const refresh = async () => {
    const [catalog, receipts] = await Promise.all([procurementApi.products(), procurementApi.list()])
    if (useAuthStore.getState().token !== identity) return
    setProducts(catalog); setHistory(receipts)
  }
  useEffect(() => {
    let active = true
    setReady(false)
    intent.load().then(saved => { if (active) { setItems(saved.items); setPending(!!saved.id); setReady(true) } }).catch(e => { if (active) setError(e.message) })
    refresh().catch(e => { if (active) setError(e.message) })
    const onRefresh = () => { refresh().catch(e => { if (active) setError(e.message) }) }
    window.addEventListener('hisvex-procurement-refresh',onRefresh)
    return () => { active = false; window.removeEventListener('hisvex-procurement-refresh',onRefresh) }
  // The controller captures this exact session and survives route rerenders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])
  const choose = (id: string) => {
    setProductId(id); const p = products.find(p => p.id === id)
    setName(p?.name ?? ''); setUnit(p?.unit ?? 'dona'); setPrice(p ? String(p.buyPrice) : '')
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const next = await intent.saveDraft([...items, { ...(productId ? { productId } : {}), name, unit, quantity: Number(quantity), buyPrice: Number(price) }])
      setItems(next.items); choose(''); setQuantity('1')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async (index: number) => {
    setBusy(true)
    try { const next = await intent.saveDraft(items.filter((_, i) => i !== index)); setItems(next.items) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const confirm = async () => {
    setBusy(true); setPending(true); setError('')
    try { await intent.confirm(procurementApi.submit); setItems([]); setPending(false); await refresh() }
    catch (e) { setError((e as Error).message); try { const saved = await intent.load(); setPending(!!saved.id) } catch {} } finally { setBusy(false) }
  }
  const field = {padding:10,borderRadius:8,border:'1px solid var(--color-border)',background:'var(--color-surface)',color:'var(--color-text)'}
  return <section style={{maxWidth:1000,margin:'0 auto',color:'var(--color-text)'}}>
    <h1>{catalogOnly ? 'Mahsulotlar' : 'Kirimlar'}</h1>
    {error && <p role="alert">{error}</p>}
    {catalogOnly ? <><p>Yangi mahsulot yoki qoldiqni Kirimlar savatida qo‘shing.</p><table style={{width:'100%'}}><thead><tr><th>Mahsulot</th><th>Qoldiq</th><th>Xarid narxi</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.quantity} {p.unit}</td><td>{p.buyPrice.toLocaleString()} so‘m</td></tr>)}</tbody></table></> : <>
      <form onSubmit={add} style={{display:'grid',gap:12}}>
        <label>Mahsulot<select value={productId} onChange={e => choose(e.target.value)} disabled={!ready||pending||busy} style={{...field,width:'100%'}}><option value="">Yangi mahsulot</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Nomi<input required value={name} onChange={e => setName(e.target.value)} disabled={!!productId||pending||busy} style={{...field,width:'100%'}} /></label>
        <label>Birlik<select value={unit} onChange={e => setUnit(e.target.value as 'dona'|'kg')} disabled={!!productId||pending||busy} style={field}><option value="dona">dona</option><option value="kg">kg</option></select></label>
        <label>Miqdor<input required type="number" min={unit==='kg'?0.001:1} step={unit==='kg'?0.001:1} value={quantity} onChange={e => setQuantity(e.target.value)} disabled={pending||busy} style={field}/></label>
        <label>Xarid narxi (so‘m)<input required type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} disabled={pending||busy} style={field}/></label>
        <button disabled={!ready||pending||busy} style={field}>Savatga qo‘shish</button>
      </form>
      <ul>{items.map((item,i) => <li key={i}>{item.name}: {item.quantity} {item.unit} × {item.buyPrice.toLocaleString()} so‘m <button disabled={pending||busy} onClick={() => remove(i)}>Olib tashlash</button></li>)}</ul>
      <p>Jami: {items.reduce((total,item) => total+item.quantity*item.buyPrice,0).toLocaleString()} so‘m</p>
      {pending && <p role="status">Kirim tasdig‘i kutilmoqda. Qayta tekshirish shu amalni davom ettiradi.</p>}
      <button onClick={confirm} disabled={!ready||busy||!items.length} style={field}>{busy?'Kutilmoqda…':pending?'Tasdiqni qayta tekshirish':'Barcha kirimni tasdiqlash'}</button>
      <h2>Oldingi kirimlar</h2><ul>{history.map(receipt => <li key={receipt.localId}>{receipt.date} — {receipt.totalCost.toLocaleString()} so‘m</li>)}</ul>
    </>}
  </section>
}
