import type { DailySnapshot, InventoryItem, Product, InventoryOperation } from '../types'

export type QueueKind = 'product' | 'inventory' | 'daily' | 'operation'
interface QueuedItemBase { localId: string; deviceId: string; updatedAt: string }
export type QueuedProduct = Product & QueuedItemBase & { baseVersion?: number; operationId?: string }
export type QueuedInventory = InventoryItem & QueuedItemBase
export type QueuedDaily = DailySnapshot & QueuedItemBase
export type QueuedOperation = InventoryOperation & QueuedItemBase
interface Items { product: QueuedProduct; inventory: QueuedInventory; daily: QueuedDaily; operation: QueuedOperation }
export type QueueSnapshot = { [K in QueueKind]: Items[K][] }
type QueueState = { [K in QueueKind]: Record<string, Items[K]> }
const kinds: QueueKind[] = ['product', 'inventory', 'daily', 'operation']
const empty = (): QueueState => ({ product: {}, inventory: {}, daily: {}, operation: {} })
type Scope = { owner: string; state: QueueState; ready: Promise<void>; tail: Promise<unknown> }
const scopes = new Map<string, Scope>()
let active: Scope | undefined
const listeners = new Set<() => void>()
function notify() { for (const listener of listeners) { try { listener() } catch {} } }
const key = (owner: string) => `hisvex_offline_queue:${owner}`

function scopeFor(owner: string): Scope {
  const existing = scopes.get(owner)
  if (existing) return existing
  const scope: Scope = { owner, state: empty(), ready: Promise.resolve(), tail: Promise.resolve() }
  scope.ready = (async () => {
    const stored = localStorage.getItem(key(owner))
    if (!stored) return
    const plaintext = stored.startsWith('{') ? stored : await window.electronAPI?.safeStorageDecrypt(stored)
    if (!plaintext) throw new Error('Saqlangan navbatni ochib bo‘lmadi. Asl nusxa saqlanib qoldi.')
    const parsed = JSON.parse(plaintext)
    if (!parsed || typeof parsed !== 'object' || !parsed.product || !parsed.inventory || !parsed.daily) throw new Error('Navbat buzilgan; asl nusxa saqlanib qoldi.')
    for (const kind of kinds) (scope.state[kind] as object) = parsed[kind] ?? {}
  })()
  // Report through waitForQueue/enqueue without an unhandled rejection.
  void scope.ready.then(notify, notify)
  scopes.set(owner, scope)
  return scope
}

export function setActiveUser(owner: string | null): void {
  active = owner ? scopeFor(owner) : undefined
  notify()
}
export function getActiveUser(): string | null { return active?.owner ?? null }
export async function waitForQueue(): Promise<void> {
  const scope = active
  if (!scope) throw new Error('Hisobga kiring')
  await scope.ready
  await scope.tail
  if (active !== scope) throw new Error('Hisob o‘zgardi; amal avvalgi hisobda saqlanadi')
}

async function mutate(scope: Scope, change: (next: QueueState) => void) {
  const work = async () => {
    await scope.ready
    const next = structuredClone(scope.state)
    change(next)
    const json = JSON.stringify(next)
    const encrypted = await window.electronAPI?.safeStorageEncrypt(json)
    if (!encrypted || encrypted === json) throw new Error('Xavfsiz saqlash ishlamadi. Amal tasdiqlanmadi.')
    // Always finish writing the captured owner's key, even during logout.
    // Serializing encryption + persistence prevents older snapshots winning.
    localStorage.setItem(key(scope.owner), encrypted)
    scope.state = next
    if (active === scope) notify()
  }
  const pending = scope.tail.then(work, work)
  scope.tail = pending.catch(() => {})
  return pending
}

/** Resolves only after durable encrypted persistence. UI confirmation awaits it. */
export async function enqueue<K extends QueueKind>(kind: K, item: Items[K]): Promise<void> {
  const scope = active
  if (!scope || !item.localId) throw new Error('Navbat uchun hisob va amal ID kerak')
  const captured = structuredClone(item)
  await mutate(scope, next => {
    const bucket = next[kind] as Record<string, Items[K]>
    if(kind==='operation') {
      const operation=captured as QueuedOperation
      const ids=operation.kind==='restock'?[operation.productId]:(operation.kind==='sale'?operation.lines:operation.items).map(line=>line.productId)
      const absolutePending=ids.some(id=>next.product[id])||Object.values(next.operation).some(op=>(op.kind==='adjustment')&&op.localId!==operation.localId&&op.items.some(line=>ids.includes(line.productId)))
      if(absolutePending) throw Error('Bazaviy qoldiq hali tasdiqlanmagan. Avval sinxronlang.')
      if((operation.kind==='adjustment')&&Object.values(next.operation).some(op=>op.localId!==operation.localId&&(op.kind==='restock'?[op.productId]:(op.kind==='sale'?op.lines:op.items).map(line=>line.productId)).some(id=>ids.includes(id)))) throw Error('Tasdiqlanmagan savdo/kirim bor. Avval sinxronlang.')
    }
    if (kind === 'operation' && bucket[item.localId] && JSON.stringify(bucket[item.localId]) !== JSON.stringify(captured)) throw new Error('Amal ID qayta ishlatilgan')
    if (kind === 'product') {
      const affected = [...Object.values(next.operation)].some(op => op.kind === 'restock' ? op.productId === item.localId : (op.kind === 'sale' ? op.lines : op.items).some(line => line.productId === item.localId)) || Object.values(next.inventory).some(entry => entry.productId === item.localId)
      if (affected) throw Error('Bu mahsulotning savdo/kirim amali hali tasdiqlanmagan. Tahrirdan oldin sinxronlang.')
      const product = captured as QueuedProduct
      product.baseVersion = next.product[item.localId]?.baseVersion ?? product.baseVersion ?? product.serverVersion ?? 0
      product.operationId = crypto.randomUUID()
    }
    bucket[item.localId] = captured
  })
  if (active !== scope) throw new Error('Hisob o‘zgardi; amal avvalgi hisobda saqlanadi')
}
export function getQueueSnapshot(): QueueSnapshot {
  const state = active?.state ?? empty()
  return { product: Object.values(state.product), inventory: Object.values(state.inventory), daily: Object.values(state.daily), operation: Object.values(state.operation) }
}
export async function assertNoPendingProductWrites(productId:string) {
  await waitForQueue()
  const queue=getQueueSnapshot()
  if(queue.product.some(p=>p.localId===productId)||queue.inventory.some(i=>i.productId===productId)||queue.operation.some(op=>op.kind==='restock'?op.productId===productId:(op.kind==='sale'?op.lines:op.items).some(line=>line.productId===productId))) {
    throw Error('Mahsulotga tegishli tasdiqlanmagan amal bor. Avval navbatni tekshiring.')
  }
}
export async function removeSynced(kind: QueueKind, items: {localId: string; updatedAt: string; operationId?: string}[], owner = getActiveUser()): Promise<void> {
  if (!owner || !items.length) return
  await mutate(scopeFor(owner), next => {
    const bucket = next[kind] as Record<string, QueuedItemBase & {operationId?: string}>
    for (const sent of items) {
      const current = bucket[sent.localId]
      if (current && current.updatedAt === sent.updatedAt && current.operationId === sent.operationId) delete bucket[sent.localId]
    }
  })
}
export function getPendingCount() { return Object.values(getQueueSnapshot()).reduce((sum, items) => sum + items.length, 0) }
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

export function getPendingProductIds(): Set<string> {
  const queue = getQueueSnapshot()
  const ids = new Set<string>()
  queue.product.forEach(p => { ids.add(p._id); ids.add(p.localId) })
  queue.inventory.forEach(i => ids.add(i.productId))
  queue.operation.forEach(op => {
    if (op.kind === 'restock') ids.add(op.productId)
    else (op.kind === 'sale' ? op.lines : op.items).forEach(line => ids.add(line.productId))
  })
  return ids
}
