import { isOnline, subscribeOnline } from '../utils/network'
import { getQueueSnapshot, getActiveUser, waitForQueue, removeSynced } from './offlineQueue'
import { syncApi } from '../api/client'
import { useAppStore } from './appStore'
import type { DailySnapshot, InventoryItem, Product, SyncPayload, SyncResponse } from '../types'

export interface SyncResult { ok: boolean; error?: string }
const checkpointKey = (owner: string) => `hisvex_sync_v2:${owner}`
// sync.pull.ts throws these when the cursor/checkpoint itself is the
// problem (rotated HMAC secret, server revision moved backwards, scope
// changed mid-page) — not a normal transient failure. See performSync's
// pull loop below for the bounded-single-retry recovery.
const SYNC_CURSOR_RESET_CODES = new Set(['INVALID_SYNC_CURSOR', 'SYNC_RESET_REQUIRED', 'SYNC_SCOPE_CHANGED'])
function mergeById<T extends { _id: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing
  const merged = new Map(existing.map((item) => [item._id, item]))
  for (const item of incoming) {
    merged.set(item._id, item)
  }
  return Array.from(merged.values())
}

// Same as mergeById, but also reconciles offline-created products: a
// product made while offline (ProductsScreen.tsx's saveProductOffline) has
// no real server _id yet, so it's optimistically stored with its
// client-generated localId standing in as `_id`. Once that product syncs,
// the server assigns its own real _id for the same localId (see
// product.service.ts's createLocalId) and returns it here as `incoming`.
// Without this, the placeholder row (keyed by localId) and the reconciled
// row (keyed by the real _id) would both remain in the array as a
// duplicate. Dropping the placeholder by localId match fixes that.
function mergeProducts(existing: Product[], incoming: Product[]): Product[] {
  if (incoming.length === 0) return existing
  const merged = new Map(existing.map((item) => [item._id, item]))
  for (const item of incoming) {
    if (item.localId && item.localId !== item._id && merged.has(item.localId)) {
      merged.delete(item.localId)
    }
    merged.set(item._id, item)
  }
  return Array.from(merged.values())
}

// Applies pulled server updates by merging into appStore's existing arrays
// via its own setState (the same mechanism authStore.ts's clearSession/
// hydrateBlockCode use to update state from outside a component), rather
// than bypassing the store with some parallel piece of state.
function applyPulledUpdates(response: SyncResponse): void {
  const pending = getQueueSnapshot()
  const pendingProducts = new Set(pending.product.map(p => p.localId))
  const pendingInventory = new Set(pending.inventory.map(i => i.productId))
  for (const op of pending.operation) {
    const ids = op.kind === 'restock' ? [op.productId] : (op.kind === 'sale' ? op.lines : op.items).map(line => line.productId)
    ids.forEach(id => { pendingProducts.add(id); pendingInventory.add(id) })
  }
  response = { ...response, products: response.products.filter(p => !pendingProducts.has(p.localId ?? p._id)), inventory: response.inventory.filter(i => !pendingInventory.has(i.productId)) }
  useAppStore.setState((state) => ({
    products: mergeProducts(state.products, response.products ?? []).filter(product =>
      !(response.deletedProducts ?? []).some(deleted => deleted.localId === product.localId || deleted.productId === product._id)),
    inventory: mergeById<InventoryItem>(state.inventory, response.inventory ?? []),
    snapshots: Object.values(pending).some(items=>items.length>0)?state.snapshots:mergeById<DailySnapshot>(state.snapshots, response.daily ?? []),
  }))
}


const flights = new Map<string, Promise<SyncResult>>()
export function syncNow(): Promise<SyncResult> {
  const owner = getActiveUser()
  if (!isOnline() || !owner) return Promise.resolve({ ok: false })
  const existing = flights.get(owner)
  if (existing) return existing
  const pending = performSync(owner).finally(() => flights.delete(owner))
  flights.set(owner, pending)
  return pending
}

async function performSync(owner: string, isCursorResetRetry = false): Promise<SyncResult> {
  const assertOwner = () => { if (getActiveUser() !== owner) throw Error('Hisob o‘zgardi; navbat o‘z hisobida saqlandi') }
  try {
    await waitForQueue(); assertOwner(); resetSyncBaseline(owner)
    const queue = getQueueSnapshot()
    const rejectionMessages: string[] = []
    // Push in bounded batches. All received pages are pulled again below;
    // no partial response advances the checkpoint.
    const count = Math.max(queue.product.length, queue.inventory.length, queue.daily.length, queue.operation.length)
    for (let offset = 0; offset < count; offset += 100) {
      assertOwner()
      const sent = { product: queue.product.slice(offset, offset + 100), inventory: queue.inventory.slice(offset, offset + 100), daily: queue.daily.slice(offset, offset + 100), operation: queue.operation.slice(offset, offset + 100) }
      const payload: SyncPayload = { protocolVersion: 2, limit: 1,
        products: sent.product.map(p => ({ ...p, createdAt: p.createdAt ?? p.updatedAt })),
        inventory: sent.inventory.map(i => ({ ...i, createdAt: i.createdAt ?? i.updatedAt })),
        daily: sent.daily.map(d => ({ ...d, createdAt: d.createdAt ?? d.updatedAt })),
        operations: sent.operation,
      }
      const { data } = await syncApi.sync(payload, owner)
      assertOwner()
      if (data.protocolVersion !== 2 || !data.acknowledged) throw Error('Server yangilanishi kerak. Navbat saqlanib qoldi.')
      for (const [kind, items] of Object.entries(sent) as [keyof typeof sent, (typeof sent)[keyof typeof sent]][]) {
        const entity = kind === 'daily' ? 'snapshot' : kind
        const confirmed = items.filter(item => data.acknowledged!.some(ack => ack.entity === entity && ack.localId === item.localId && (kind === 'operation' || ack.updatedAt === item.updatedAt)))
        await removeSynced(kind, confirmed, owner)
      }
      rejectionMessages.push(...data.rejected.map(item => `${item.localId}: ${item.message || item.reason}`))
    }
    let cursor: string | undefined
    let checkpoint = localStorage.getItem(checkpointKey(owner)) ?? undefined
    let collected: SyncResponse | undefined
    do {
      assertOwner()
      let data: SyncResponse
      try {
        ;({ data } = await syncApi.sync({ protocolVersion: 2, checkpoint, cursor, limit: 200 }, owner))
      } catch (err: any) {
        const code = err?.code as string | undefined
        if (!isCursorResetRetry && code && SYNC_CURSOR_RESET_CODES.has(code)) {
          // Zero-wipe recovery: drop ONLY the persisted checkpoint (this
          // call's own in-memory cursor/pull-buffer is discarded too, simply
          // by not continuing this loop) and restart the whole sync fresh,
          // exactly once. The offline queue and every local business record
          // are never touched — re-running the push phase on retry is safe
          // regardless, since it already only sends what's still queued and
          // every push item carries a durable operation ID.
          localStorage.removeItem(checkpointKey(owner))
          return performSync(owner, true)
        }
        throw err
      }
      assertOwner()
      if (data.protocolVersion !== 2) throw Error('Server sync versiyasi mos emas. Navbat saqlanib qoldi.')
      if (data.hasMore && !data.nextCursor) throw Error('Sync sahifasi to‘liq emas')
      collected = collected ? { ...data,
        products: [...collected.products, ...data.products], inventory: [...collected.inventory, ...data.inventory],
        daily: [...collected.daily, ...data.daily], deletedProducts: [...(collected.deletedProducts ?? []), ...(data.deletedProducts ?? [])],
      } : data
      cursor = data.nextCursor ?? undefined
      if (!data.hasMore) checkpoint = data.checkpoint ?? undefined
    } while (cursor)
    assertOwner()
    if (!checkpoint || !collected) throw Error('Sync checkpoint olinmadi')
    applyPulledUpdates(collected)
    // The UI cache is in memory. On restart we do a full pull; this token is
    // never reused against an empty, newly opened renderer store.
    if (Object.values(getQueueSnapshot()).every(items => items.length === 0)) localStorage.setItem(checkpointKey(owner), checkpoint)
    if (rejectionMessages.length) return { ok: false, error: `${rejectionMessages.length} ta amal tasdiqlanmadi; navbatda saqlanadi. ${rejectionMessages.slice(0, 3).join('; ')}` }
    return { ok: Object.values(getQueueSnapshot()).every(items => items.length === 0) }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Sinxronlash amalga oshmadi' } }
}

// Cache persistence is separate from durable intent persistence. A fresh
// renderer always needs a baseline before it can consume a delta checkpoint.
const loadedOwners = new Set<string>()
export function resetSyncBaseline(owner: string) {
  if (!loadedOwners.has(owner) || useAppStore.getState().products.length === 0) { localStorage.removeItem(checkpointKey(owner)); loadedOwners.add(owner) }
}
let backgroundTimer: ReturnType<typeof setInterval> | null = null
if (typeof window !== 'undefined') {
  subscribeOnline(online => { if (online) void syncNow() })
  backgroundTimer = setInterval(() => { if (isOnline() && getActiveUser()) void syncNow() }, 60_000)
}
export function stopBackgroundSync() { if (backgroundTimer) clearInterval(backgroundTimer); backgroundTimer = null }
