import { create } from 'zustand'
import { setApiToken, setRefreshToken, clearApiCache, authApi } from '../api/client'
import { setBusinessDayStartHour } from '../utils/businessDay'
import {
  readStoredAuth,
  setStoredToken,
  setStoredRefreshToken,
  setStoredUser,
  clearStoredAuth,
} from '../utils/authStorage'
import { clearQueue as clearOfflineQueue, setActiveUser as setOfflineQueueUser } from './offlineQueue'
import { useAppStore } from './appStore'
import type { User } from '../types'

function withoutBlockCode(user: User): User {
  const { blockCode: _, ...rest } = user
  return rest as User
}

function applyBusinessDayHour(user: User | null | undefined) {
  if (user?.businessDayStartHour != null) {
    setBusinessDayStartHour(user.businessDayStartHour)
  }
}

function persistToken(token: string) {
  void setStoredToken(token)
}

function persistRefreshToken(token: string) {
  void setStoredRefreshToken(token)
}

function persistUser(user: User) {
  void setStoredUser(withoutBlockCode(user))
}

interface AuthState {
  token: string
  refreshToken: string
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  setAuth: (token: string, refreshToken: string, user: User) => void
  setUser: (user: User) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: '',
  refreshToken: '',
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: (token, refreshToken, user) => {
    const normalized = { ...user }
    if (!normalized._id && (normalized as any).id) {
      normalized._id = (normalized as any).id
    }
    setApiToken(token)
    setRefreshToken(refreshToken)
    persistToken(token)
    persistRefreshToken(refreshToken)
    persistUser(normalized)
    applyBusinessDayHour(normalized)
    // Scope the offline mutation queue to this user *before* anything else
    // can enqueue into it, so a shared-PC account switch never lets one
    // user's queued edits sync under another user's session (see
    // offlineQueue.ts's setActiveUser).
    setOfflineQueueUser(normalized._id ?? null)
    set({ token, refreshToken, user: normalized, isAuthenticated: true })
  },

  setUser: (user) => {
    persistUser(user)
    set({ user })
  },

  logout: () => {
    clearSession()
  },

  setLoading: (isLoading) => set({ isLoading }),

  hydrate: async () => {
    set({ isLoading: true })
    try {
      const stored = await readStoredAuth()
      if (!stored?.token) {
        set({ isLoading: false })
        return
      }
      setApiToken(stored.token)
      setRefreshToken(stored.refreshToken)
      set({ token: stored.token, refreshToken: stored.refreshToken, user: stored.user ?? null })
      applyBusinessDayHour(stored.user)
      // Same scoping as setAuth() above — a resumed session (app restart
      // without logging out) must resolve to this user's own offline queue
      // before any screen can enqueue into it.
      setOfflineQueueUser(stored.user?._id ?? null)
      // isAuthenticated/isLoading are finalized only once revalidation
      // below resolves, so role/blockCode-gated screens never render
      // against stale or foreign data.
      await hydrateBlockCode()
    } catch {
      set({ isLoading: false })
    }
  },
}))

// Single shared session-clear/logout function. Used by both the explicit
// user-triggered logout() above and api/client.ts's 401 interceptor (via
// the unauthorizedHandler wiring in App.tsx) so clearing logic exists in
// exactly one place.
export function clearSession(): void {
  try { authApi.logout().catch(() => {}) } catch {}
  setApiToken(null)
  setRefreshToken('')
  clearApiCache()
  useAuthStore.setState({ token: '', refreshToken: '', user: null, isAuthenticated: false })
  void clearStoredAuth()
  // Offline queue: drop whatever is still queued for the outgoing user, then
  // point the queue back at the unscoped/no-user key. This is a deliberate
  // choice not to attempt a final sync first — this app has no existing
  // "sync on logout" step, and adding one here would risk hanging/failing
  // the logout flow on a flaky connection. The trade-off (any genuinely
  // unsynced edits from this session are lost on logout) is preferred over
  // the alternative: leaving them queued risks a future user's session
  // flushing them, which is the actual security bug being fixed.
  clearOfflineQueue()
  setOfflineQueueUser(null)
  // Product/inventory/dashboard/snapshot data is user-visible and
  // action-affecting (prices, stock) — reset it so a fast account switch on
  // a shared PC can't briefly show (or let someone act on) the outgoing
  // user's stale catalog before the next loadProducts() refetches.
  useAppStore.getState().reset()
  try { void window.electronAPI?.blockClear?.() } catch {}
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === 'ERR_NETWORK' || code === 'ECONNABORTED'
}

async function hydrateBlockCode() {
  const current = useAuthStore.getState().user
  if (!current) {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false })
    return
  }
  let code: string | null = null
  try {
    code = await window.electronAPI?.blockGet?.() ?? null
  } catch {
    code = null
  }
  if (code) {
    useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, blockCode: code })
  }
  try {
    const { data } = await authApi.getMe()
    if (data) {
      useAuthStore.getState().setUser({ ...data, blockCode: (data as User).blockCode ?? code ?? null })
      applyBusinessDayHour(data as User)
    }
    useAuthStore.setState({ isAuthenticated: true, isLoading: false })
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      // offline — keep persisted user
      useAuthStore.setState({ isAuthenticated: true, isLoading: false })
    } else {
      // Hard revalidation failure (e.g. invalid/expired session). The 401
      // interceptor path already runs clearSession() via unauthorizedHandler
      // in that case — just make sure isLoading doesn't stay stuck.
      useAuthStore.setState({ isLoading: false })
    }
  }
}
