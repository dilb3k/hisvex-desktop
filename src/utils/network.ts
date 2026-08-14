// Online/offline detection for the offline-first sync engine.
//
// navigator.onLine only reflects the OS network interface (e.g. still true
// on a Wi-Fi network with no internet, or behind a captive portal) — it does
// NOT mean the backend at API_BASE_URL is actually reachable. So we combine:
//   1. Browser 'online'/'offline' events (fast signal, catches "no interface").
//   2. A periodic active health check against the backend (catches "interface
//      up but backend down/unreachable").
// Both signals are debounced before notifying subscribers so a flapping
// connection (e.g. several 'offline'/'online' events in a row, or one failed
// health check followed immediately by a successful one) doesn't spam
// listeners with transient flips.

import { healthApi } from '../api/client'

const DEBOUNCE_MS = 1500
const HEALTH_CHECK_INTERVAL_MS = 10000

let currentOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true
const listeners = new Set<(online: boolean) => void>()

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingValue: boolean | null = null

function commit(next: boolean) {
  pendingValue = next
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const value = pendingValue
    pendingValue = null
    if (value === null || value === currentOnline) return
    currentOnline = value
    listeners.forEach((listener) => {
      try {
        listener(currentOnline)
      } catch {
        // A misbehaving listener must not break the rest of the fan-out.
      }
    })
  }, DEBOUNCE_MS)
}

async function checkBackendReachable(): Promise<boolean> {
  try {
    await healthApi.check()
    return true
  } catch {
    return false
  }
}

async function runHealthCheck() {
  // Real-bug fix: this used to skip the actual backend round-trip whenever
  // navigator.onLine reported false, on the assumption that flag is a
  // reliable negative signal. On Windows it isn't — Chromium's 'online'
  // event (and the onLine flag with it) can fail to fire or stay stuck
  // false after a real reconnect (Wi-Fi hand-off, VPN toggle, sleep/wake),
  // which permanently starved this periodic check from ever re-verifying
  // reachability: the app stayed "stuck offline" — and every fetch gated
  // on isOnline() kept erroring or silently queuing — until the process
  // was restarted. Always attempt the real check; healthApi.check() has
  // its own short timeout so a genuinely offline probe still fails fast.
  const reachable = await checkBackendReachable()
  commit(reachable)
}

/** Returns the last known online/offline state (debounced). */
export function isOnline(): boolean {
  return currentOnline
}

/**
 * Distinguishes a network-level failure (timeout, no connection, backend
 * unreachable) from a validation failure the backend rejected on purpose
 * (e.g. insufficient stock, duplicate barcode). Only the former should fall
 * through to an offline-queue path — a validation error must still surface
 * to the user exactly as before. api/client.ts's response interceptor tags
 * exactly these two cases with `.code` before rejecting. Shared by every
 * screen with an offline-capable mutation (Sales, Inventory, Products) so
 * the classification stays identical across all of them.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  return code === 'ECONNABORTED' || code === 'ERR_NETWORK'
}

/**
 * Subscribes to online/offline transitions. The listener fires only when the
 * debounced state actually changes. Returns an unsubscribe function.
 */
export function subscribeOnline(listener: (online: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let initialized = false
let healthTimer: ReturnType<typeof setInterval> | null = null

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('online', () => {
    // Interface came back — verify the backend is actually reachable
    // before declaring ourselves online.
    void runHealthCheck()
  })
  window.addEventListener('offline', () => {
    commit(false)
  })

  healthTimer = setInterval(() => {
    void runHealthCheck()
  }, HEALTH_CHECK_INTERVAL_MS)

  // Kick off an initial check so `isOnline()` reflects backend reachability
  // (not just the OS interface) shortly after module load.
  void runHealthCheck()
}

init()

// Exposed for completeness/tests; not required for normal app usage since
// this module has a single long-lived instance for the app's lifetime.
export function stopNetworkMonitoring(): void {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}
