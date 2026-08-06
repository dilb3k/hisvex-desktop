// Orchestration layer for offline-first sync. Later steps (screens) call
// `syncNow()` directly after local mutations; this module also drives sync
// automatically on reconnect and periodically in the background. It is not
// wired into any screen/component yet — importing this module is what
// activates its background behavior (online-transition + periodic timer),
// same self-initializing pattern as ../utils/network.ts.

import { isOnline, subscribeOnline } from '../utils/network'
import { getQueueSnapshot, getPendingCount, removeSynced } from './offlineQueue'
import { syncApi } from '../api/client'
import { useAppStore } from './appStore'
import type { DailySnapshot, InventoryItem, Product, SyncPayload, SyncResponse } from '../types'

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

// Applies pulled server updates by merging into appStore's existing arrays
// via its own setState (the same mechanism authStore.ts's clearSession/
// hydrateBlockCode use to update state from outside a component), rather
// than bypassing the store with some parallel piece of state.
function applyPulledUpdates(response: SyncResponse): void {
  useAppStore.setState((state) => ({
    products: mergeById<Product>(state.products, response.products ?? []),
    inventory: mergeById<InventoryItem>(state.inventory, response.inventory ?? []),
    snapshots: mergeById<DailySnapshot>(state.snapshots, response.daily ?? []),
  }))
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

    if (queue.product.length > 0) {
      removeSynced('product', queue.product.map((item) => item.localId))
    }
    if (queue.inventory.length > 0) {
      removeSynced('inventory', queue.inventory.map((item) => item.localId))
    }
    if (queue.daily.length > 0) {
      removeSynced('daily', queue.daily.map((item) => item.localId))
    }

    applyPulledUpdates(data)
    setLastSyncAt(data.serverTime)

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
