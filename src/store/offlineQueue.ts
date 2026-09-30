// Persistent local queue of pending offline mutations, shaped like the
// backend sync payload (see comp-bar-server backend's sync.service.ts /
// sync.validation.ts and this app's SyncPayload type in ../types).
//
// Persistence: localStorage under `hisvex_offline_queue` (or
// `hisvex_offline_queue:<userId>` once a user is active — see
// setActiveUser below), encrypted at rest via Electron's safeStorage (OS
// keychain/DPAPI — see electron/ipc.ts's `safeStorage:encrypt`/`:decrypt`
// handlers). Queue *contents* are product/inventory/daily-snapshot data the
// user already sees in the UI, not a secret the way an auth token is — the
// reason to encrypt this file specifically is that a queued sale sitting on
// disk in a directly-readable JSON file is exactly the kind of thing a
// "someone else browsing a shared PC's profile" scenario can read without
// ever running this app; safeStorage closes that without needing this
// module's whole public API to become async (see the sync/async split
// below).
//
// Scoping by user id: on a shared PC, this queue must never let one user's
// queued offline edits get flushed under a different user's session after
// an account switch. authStore.ts calls setActiveUser() with the
// authenticated user's id right after login/hydration and with `null` on
// logout (in addition to clearing the outgoing user's queue outright), so
// the storage key itself — not just an in-memory flag — differs per user
// and cross-account leakage is impossible even if some future code path
// forgets to clear.

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

const STORAGE_KEY_BASE = 'hisvex_offline_queue'

function storageKeyFor(userId: string | null): string {
  return userId ? `${STORAGE_KEY_BASE}:${userId}` : STORAGE_KEY_BASE
}

function emptyState(): QueueState {
  return { product: {}, inventory: {}, daily: {} }
}

function parseState(raw: string): QueueState {
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
}

// Everything below the state itself is synchronous and stays that way —
// enqueue()'s synchronous notify-then-return contract is relied on directly
// by Sales/Products/InventoryScreen (see their own comments: "enqueue()
// notifies offlineQueue subscribers synchronously"). Only the actual disk
// I/O (encrypt + localStorage write, or the reverse on load) is async,
// running in the background without the public API ever needing to be
// awaited.

let storageKey = storageKeyFor(null)
let state: QueueState = emptyState()

// True once the current storageKey's persisted data has been loaded (or
// confirmed absent) — guards persist() from firing before hydrate() has had
// a chance to read what's already on disk, which would otherwise overwrite
// it with an empty queue during the brief window between module init and
// the first IPC round-trip resolving.
let hydrated = false

async function decryptBlob(raw: string): Promise<string> {
  try {
    const decrypted = await window.electronAPI?.safeStorageDecrypt?.(raw)
    return decrypted ?? raw
  } catch {
    return raw
  }
}

async function encryptBlob(raw: string): Promise<string> {
  try {
    const encrypted = await window.electronAPI?.safeStorageEncrypt?.(raw)
    return encrypted ?? raw
  } catch {
    return raw
  }
}

async function hydrate(key: string): Promise<void> {
  hydrated = false
  if (typeof window === 'undefined') {
    hydrated = true
    return
  }
  try {
    const stored = localStorage.getItem(key)
    if (!stored) {
      hydrated = true
      return
    }
    // Try as encrypted ciphertext first. A blob written before this
    // encryption existed is plain JSON — safeStorage:decrypt hands back the
    // original string unchanged when it isn't valid ciphertext under this
    // OS's key (see electron/ipc.ts), so parseState() below transparently
    // handles both an old plaintext queue and a freshly-encrypted one with
    // the same code path.
    const plaintext = await decryptBlob(stored)
    // Only adopt this if the key we hydrated for is still the active one —
    // a fast user-switch could otherwise land a stale decrypt after a newer
    // hydrate() already started.
    if (key !== storageKey) return
    // Merged, not replaced: enqueue()/removeSynced() are synchronous and can
    // run during this function's own await above (a UI action landing in
    // the gap between a user-switch and this decrypt resolving). Overwriting
    // `state` outright here would silently discard whatever was enqueued
    // during that window; spreading the loaded data as the base with the
    // current in-memory state layered on top keeps it (the in-memory side
    // is, by construction, never older than what's on disk).
    const loaded = parseState(plaintext)
    state = {
      product: { ...loaded.product, ...state.product },
      inventory: { ...loaded.inventory, ...state.inventory },
      daily: { ...loaded.daily, ...state.daily },
    }
  } catch {
    if (key !== storageKey) return
  } finally {
    if (key === storageKey) hydrated = true
  }
  notify()
  // Flushes the merge back to disk promptly — otherwise a mutation that
  // landed during the await above (persist() no-ops while !hydrated) would
  // sit unsaved in memory until some later, unrelated mutation happens to
  // call persist() again.
  persist()
}

function persist(): void {
  if (typeof window === 'undefined' || !hydrated) return
  const key = storageKey
  const snapshot = state
  void (async () => {
    try {
      const json = JSON.stringify(snapshot)
      const ciphertext = await encryptBlob(json)
      // The active user/key may have changed while this encrypt was in
      // flight (e.g. a fast logout right after enqueuing) — never write a
      // stale snapshot under a key that's no longer the current one.
      if (key !== storageKey) return
      localStorage.setItem(key, ciphertext)
    } catch {
      // Best-effort persistence — a full disk / quota / IPC error shouldn't
      // crash the caller; the in-memory queue still works for the rest of
      // this session and the next persist() call gets another chance.
    }
  })()
}

// Kicks off hydration for the initial (unscoped) key immediately — before
// any user is known, same as the previous synchronous-load version did.
void hydrate(storageKey)

/**
 * Scopes the queue to a specific authenticated user (by id), so mutations
 * queued while user A is signed in can never end up flushed under user B's
 * session on a shared PC. Switching to a different id (or to `null` on
 * logout) points the queue at that user's own storage key and loads
 * whatever is already persisted there — it does not merge with, or carry
 * over, the previously-active user's in-memory queue.
 *
 * The in-memory queue is cleared synchronously the instant this is called
 * (never briefly shows the outgoing user's data under the new key) and
 * refilled from disk asynchronously once the decrypt round-trip resolves.
 *
 * Call this with the user's id right after login/session hydration
 * (authStore.ts's setAuth()/hydrate()) and with `null` from clearSession()
 * (after that user's queue has already been cleared).
 */
export function setActiveUser(userId: string | null): void {
  const nextKey = storageKeyFor(userId)
  if (nextKey === storageKey) return
  storageKey = nextKey
  state = emptyState()
  notify()
  void hydrate(nextKey)
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

/**
 * Drops successfully-synced items for the given kind — but only the exact
 * version that was actually sent and accepted, identified by
 * `(localId, updatedAt)`.
 *
 * Why not just delete by localId: a sync cycle snapshots the queue, then
 * awaits the network round-trip. If the same product/entry is mutated again
 * locally (e.g. a second offline sale for the same product) while that
 * request is in flight, enqueue() overwrites the queue entry in place with
 * the newer data — same localId, new updatedAt. A blind delete-by-localId
 * here would then discard that newer, never-sent mutation, silently
 * dropping it from both the local queue and the server (it was never in the
 * payload that got accepted). Comparing updatedAt ensures we only ever
 * remove the precise version the server actually confirmed; a superseded
 * entry is left in place and simply gets picked up by the next sync cycle
 * (safe to resend — these are absolute snapshots, not deltas).
 */
export function removeSynced(kind: QueueKind, items: { localId: string; updatedAt: string }[]): void {
  if (items.length === 0) return
  const bucket = state[kind] as Record<string, QueuedItemBase>
  let changed = false
  for (const { localId, updatedAt } of items) {
    const current = bucket[localId]
    if (current && current.updatedAt === updatedAt) {
      delete bucket[localId]
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
 * removed, a full clear, or hydration completing after a user switch). The
 * listener takes no arguments — call getPendingCount() (or
 * getQueueSnapshot()) from it to read the new state. Returns an unsubscribe
 * function. Mirrors utils/network.ts's subscribeOnline so UI code (e.g. a
 * sync-status indicator) can treat queue changes and online-state changes
 * the same way, without polling.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
