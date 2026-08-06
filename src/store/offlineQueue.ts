// Persistent local queue of pending offline mutations, shaped like the
// backend sync payload (see comp-bar-server backend's sync.service.ts /
// sync.validation.ts and this app's SyncPayload type in ../types).
//
// Persistence: localStorage under `hisvex_offline_queue`. This queue only
// holds product/inventory/daily-snapshot mutation data the user already has
// on this device (nothing secret beyond what's already synced through the
// authenticated API), so plain localStorage is sufficient here — unlike the
// auth tokens in utils/authStorage.ts, which go through electron-store via
// IPC because they're actual credentials. Simpler storage is fine for this
// non-sensitive, easily-reconstructible queue data.

import type { DailySnapshot, InventoryItem, Product } from '../types'

export type QueueKind = 'product' | 'inventory' | 'daily'

interface QueuedItemBase {
  localId: string
  deviceId: string
  updatedAt: string
}

export type QueuedProduct = Product & QueuedItemBase
export type QueuedInventory = InventoryItem & QueuedItemBase
export type QueuedDaily = DailySnapshot & QueuedItemBase

export interface QueueSnapshot {
  product: QueuedProduct[]
  inventory: QueuedInventory[]
  daily: QueuedDaily[]
}

type QueueItemFor<K extends QueueKind> = K extends 'product'
  ? QueuedProduct
  : K extends 'inventory'
    ? QueuedInventory
    : QueuedDaily

interface QueueState {
  product: Record<string, QueuedProduct>
  inventory: Record<string, QueuedInventory>
  daily: Record<string, QueuedDaily>
}

const STORAGE_KEY = 'hisvex_offline_queue'

function emptyState(): QueueState {
  return { product: {}, inventory: {}, daily: {} }
}

function loadPersisted(): QueueState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyState()
    const state = emptyState()
    for (const kind of ['product', 'inventory', 'daily'] as const) {
      const bucket = (parsed as Record<string, unknown>)[kind]
      if (bucket && typeof bucket === 'object') {
        state[kind] = bucket as Record<string, QueuedProduct & QueuedInventory & QueuedDaily>
      }
    }
    return state
  } catch {
    return emptyState()
  }
}

// Loaded once at module init so the queue survives app restarts.
let state: QueueState = loadPersisted()

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort persistence — a full disk / quota error shouldn't crash
    // the caller; the in-memory queue still works for the rest of this
    // session.
  }
}

/**
 * Upserts a pending mutation into the queue by `localId`, replacing any
 * existing pending item for that localId (last write wins locally, same as
 * the backend's own conflict resolution once it reaches the server).
 */
export function enqueue<K extends QueueKind>(kind: K, item: QueueItemFor<K>): void {
  if (!item || !item.localId) return
  ;(state[kind] as Record<string, QueueItemFor<K>>)[item.localId] = item
  persist()
  notify()
}

/** Returns pending items grouped by kind, for building a sync payload. */
export function getQueueSnapshot(): QueueSnapshot {
  return {
    product: Object.values(state.product),
    inventory: Object.values(state.inventory),
    daily: Object.values(state.daily),
  }
}

/** Drops successfully-synced items (by localId) for the given kind. */
export function removeSynced(kind: QueueKind, localIds: string[]): void {
  if (localIds.length === 0) return
  const bucket = state[kind] as Record<string, QueuedItemBase>
  let changed = false
  for (const id of localIds) {
    if (id in bucket) {
      delete bucket[id]
      changed = true
    }
  }
  if (changed) {
    persist()
    notify()
  }
}

/** Total pending item count across all kinds, for the sync-status indicator. */
export function getPendingCount(): number {
  return (
    Object.keys(state.product).length +
    Object.keys(state.inventory).length +
    Object.keys(state.daily).length
  )
}

/** Clears the entire queue. Exposed for completeness/tests. */
export function clearQueue(): void {
  state = emptyState()
  persist()
  notify()
}

const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // A misbehaving listener must not break the rest of the fan-out.
    }
  })
}

/**
 * Subscribes to any change in the queue (enqueue, a synced item being
 * removed, or a full clear). The listener takes no arguments — call
 * getPendingCount() (or getQueueSnapshot()) from it to read the new state.
 * Returns an unsubscribe function. Mirrors utils/network.ts's
 * subscribeOnline so UI code (e.g. a sync-status indicator) can treat
 * queue changes and online-state changes the same way, without polling.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
