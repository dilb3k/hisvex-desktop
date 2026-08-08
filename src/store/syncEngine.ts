// Orchestration layer for offline-first sync. Later steps (screens) call
// `syncNow()` directly after local mutations; this module also drives sync
// automatically on reconnect and periodically in the background. It is not
// wired into any screen/component yet — importing this module is what
// activates its background behavior (online-transition + periodic timer),
// same self-initializing pattern as ../utils/network.ts.

import { isOnline, subscribeOnline } from '../utils/network'
import { getQueueSnapshot, getPendingCount, removeSynced } from './offlineQueue'
import type { QueueKind } from './offlineQueue'
import { syncApi } from '../api/client'
import { useAppStore } from './appStore'
import type { DailySnapshot, InventoryItem, Product, SyncPayload, SyncRejectedItem, SyncResponse } from '../types'

const LAST_SYNC_KEY = 'hisvex_last_sync_at'
const BACKGROUND_SYNC_INTERVAL_MS = 60000

export interface SyncResult {
  ok: boolean
  error?: string
}

function getLastSyncAt(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return localStorage.getItem(LAST_SYNC_KEY) || undefined
  } catch {
    return undefined
  }
}

function setLastSyncAt(value: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LAST_SYNC_KEY, value)
  } catch {
    // Best-effort — worst case the next sync re-pulls a bit more than needed.
  }
}

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
  useAppStore.setState((state) => ({
    products: mergeProducts(state.products, response.products ?? []),
    inventory: mergeById<InventoryItem>(state.inventory, response.inventory ?? []),
    snapshots: mergeById<DailySnapshot>(state.snapshots, response.daily ?? []),
  }))
}

// Rejection reasons the server will never change its mind about, because they
// are deterministic properties of the item itself rather than transient state:
// a business day that has closed stays closed, and an entry with no date can
// never gain one. Items rejected for these must be dropped from the queue —
// keeping them (the previous behaviour) left them pending forever, which meant
// the sync-status indicator never returned to "synced" and the 60s background
// timer re-uploaded the same doomed payload for the lifetime of the install.
//
// FUTURE_DAY_NOT_ALLOWED is deliberately NOT terminal: it usually means clock
// skew, and the item becomes valid on its own once that business day arrives.
const TERMINAL_REJECT_REASONS = new Set(['PAST_DAY_LOCKED', 'MISSING_DATE'])

// Backend entity names (sync.service.ts) -> local queue kinds.
const ENTITY_TO_KIND: Record<string, QueueKind> = {
  product: 'product',
  inventory: 'inventory',
  snapshot: 'daily',
}

/**
 * Splits one kind's sent localIds into those to remove from the queue
 * (accepted, plus rejected-for-good) and those to keep for a later retry.
 *
 * Rejections are matched per entity kind rather than through one flat set of
 * localIds: an inventory entry's localId is `${date}-${productLocalId}`, so a
 * flat set could let a product rejection suppress removal of an unrelated
 * inventory item that happened to share the string.
 */
function partitionQueueIds(
  kind: QueueKind,
  sentLocalIds: string[],
  rejected: SyncRejectedItem[],
): { remove: string[]; retryCount: number } {
  const rejectedForKind = new Map<string, string>()
  for (const item of rejected) {
    if (ENTITY_TO_KIND[item.entity] === kind) {
      rejectedForKind.set(item.localId, item.reason)
    }
  }

  const remove: string[] = []
  let retryCount = 0
  for (const id of sentLocalIds) {
    const reason = rejectedForKind.get(id)
    if (reason === undefined || TERMINAL_REJECT_REASONS.has(reason)) {
      remove.push(id)
    } else {
      retryCount += 1
    }
  }
  return { remove, retryCount }
}

let syncInFlight: Promise<SyncResult> | null = null

/**
 * Runs one sync cycle: pushes everything pending in the offline queue and
 * pulls everything the server has updated since the last successful sync.
 *
 * - Offline: returns `{ ok: false }` immediately, no network call, queue
 *   left untouched.
 * - Success: queue entries that were included are removed, pulled updates
 *   are merged into appStore, lastSyncAt is advanced, returns `{ ok: true }`.
 * - Failure: queue is left intact so the next attempt retries, returns
 *   `{ ok: false, error }`.
 *
 * Concurrent calls (e.g. a reconnect trigger firing while the background
 * timer is also due) are coalesced into a single in-flight request.
 */
export function syncNow(): Promise<SyncResult> {
  if (!isOnline()) {
    return Promise.resolve({ ok: false })
  }
  if (syncInFlight) return syncInFlight

  syncInFlight = performSync().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function performSync(): Promise<SyncResult> {
  const queue = getQueueSnapshot()
  const payload: SyncPayload = { lastSyncAt: getLastSyncAt() }
  if (queue.product.length > 0) payload.products = queue.product
  if (queue.inventory.length > 0) payload.inventory = queue.inventory
  if (queue.daily.length > 0) payload.daily = queue.daily

  try {
    const { data } = await syncApi.sync(payload)

    // The server validates each queued item independently (e.g. an inventory
    // edit queued yesterday but only synced after the business day rolled
    // over comes back PAST_DAY_LOCKED) and reports failures in `rejected`
    // without failing the whole call. Accepted items are dropped; rejected
    // ones are dropped only when the reason is terminal (see
    // TERMINAL_REJECT_REASONS) and otherwise kept for the next attempt.
    let retryTotal = 0
    for (const [kind, items] of [
      ['product', queue.product],
      ['inventory', queue.inventory],
      ['daily', queue.daily],
    ] as const) {
      if (items.length === 0) continue
      const { remove, retryCount } = partitionQueueIds(
        kind,
        items.map((item) => item.localId),
        data.rejected,
      )
      removeSynced(kind, remove)
      retryTotal += retryCount
    }

    // Terminal rejections are discarded rather than retried, so they need their
    // own message — "qayta urinib ko'riladi" would be a lie for these.
    const droppedTotal = data.rejected.filter(
      (item) => ENTITY_TO_KIND[item.entity] && TERMINAL_REJECT_REASONS.has(item.reason),
    ).length

    applyPulledUpdates(data)
    setLastSyncAt(data.serverTime)

    if (data.rejected.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('Sync: server rejected some queued items', data.rejected)
      if (droppedTotal > 0) {
        return {
          ok: true,
          error: `${droppedTotal} ta yozuv sinxronlanmadi (kun yopilgan) va o'chirildi`,
        }
      }
      if (retryTotal > 0) {
        return {
          ok: true,
          error: `${retryTotal} ta yozuv sinxronlanmadi — qayta urinib ko'riladi`,
        }
      }
    }

    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sinxronlash muvaffaqiyatsiz tugadi'
    return { ok: false, error: message }
  }
}

let initialized = false
let backgroundTimer: ReturnType<typeof setInterval> | null = null

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // Offline -> online transitions auto-trigger a sync. subscribeOnline only
  // notifies on an actual (debounced) state change, so this fires once per
  // transition rather than repeatedly.
  subscribeOnline((online) => {
    if (online) {
      void syncNow()
    }
  })

  // Periodic background sync so items queued while nominally online (e.g. a
  // transient request failure that fell back to the offline queue) don't
  // wait indefinitely for an offline->online reconnect event that may never
  // come.
  backgroundTimer = setInterval(() => {
    if (isOnline() && getPendingCount() > 0) {
      void syncNow()
    }
  }, BACKGROUND_SYNC_INTERVAL_MS)
}

init()

// Exposed for completeness/tests; not required for normal app usage since
// this module has a single long-lived instance for the app's lifetime.
export function stopBackgroundSync(): void {
  if (backgroundTimer) {
    clearInterval(backgroundTimer)
    backgroundTimer = null
  }
}
