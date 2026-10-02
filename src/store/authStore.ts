import { create } from 'zustand'
import { setApiToken, setRefreshToken, clearApiCache, authApi } from '../api/client'
import { syncBusinessDayFromServer } from '../utils/businessDay'
import {
  readStoredAuth,
  setStoredUser,
  writeStoredAuth,
  tokenExpiry,
  clearStoredAuth,
} from '../utils/authStorage'
import { setActiveUser as setOfflineQueueUser } from './offlineQueue'
import { useAppStore } from './appStore'
import type { User } from '../types'

function withoutBlockCode(user: User): User {
  const { blockCode: _, ...rest } = user
  return rest as User
}

function applyBusinessDayHour(user: User | null | undefined) {
  if (!user) return
  // Mirror the server's whole business-day state, not just the active hour —
  // see syncBusinessDayFromServer for why taking only businessDayStartHour
  // silently reverted a scheduled change the client had already applied.
  syncBusinessDayFromServer({
    businessDayStartHour: user.businessDayStartHour,
    pendingBusinessDayStartHour: user.pendingBusinessDayStartHour,
    businessDayEffectiveFrom: user.businessDayEffectiveFrom,
  })
}

function persistUser(user: User) {
  void setStoredUser(withoutBlockCode(user)).catch(() => useAuthStore.setState({ persistenceError: 'Sessiya ma’lumotini saqlab bo‘lmadi. Disk yoki tizim keychainini tekshiring.' }))
}

let sessionGeneration = 0

interface AuthState {
  token: string
  refreshToken: string
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  persistenceError: string
  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>
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
  persistenceError: '',

  setAuth: async (token, refreshToken, user) => {
    const generation = ++sessionGeneration
    const normalized = { ...user }
    if (!normalized._id && (normalized as any).id) {
      normalized._id = (normalized as any).id
    }
    useAppStore.getState().reset()
    setApiToken(token)
    setRefreshToken(refreshToken)
    try {
      await writeStoredAuth({ token, refreshToken, user: withoutBlockCode(normalized) })
      if (generation !== sessionGeneration) throw Error('Sessiya o‘zgardi')
    } catch (error) {
      if (generation === sessionGeneration) {
        setApiToken(null); setRefreshToken(''); setOfflineQueueUser(null)
        set({ token: '', refreshToken: '', user: null, isAuthenticated: false, isLoading: false })
      }
      throw error
    }
    applyBusinessDayHour(normalized)
    // Scope the offline mutation queue to this user *before* anything else
    // can enqueue into it, so a shared-PC account switch never lets one
    // user's queued edits sync under another user's session (see
    // offlineQueue.ts's setActiveUser).
    setOfflineQueueUser(normalized.scope === 'procurement' ? null : normalized._id ?? null)
    set({ token, refreshToken, user: normalized, isAuthenticated: true, isLoading: false, persistenceError: '' })
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
    const generation = sessionGeneration
    set({ isLoading: true })
    try {
      const stored = await readStoredAuth()
      if (generation !== sessionGeneration) return
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
      setOfflineQueueUser(stored.user?.scope === 'procurement' ? null : stored.user?._id ?? null)
      // isAuthenticated/isLoading are finalized only once revalidation
      // below resolves, so role/blockCode-gated screens never render
      // against stale or foreign data.
      await hydrateBlockCode()
    } catch (error) {
      if (generation !== sessionGeneration) return
      set({ isLoading: false, persistenceError: (error as Error).message })
    }
  },
}))

// Single shared session-clear/logout function. Used by both the explicit
// user-triggered logout() above and api/client.ts's 401 interceptor (via
// the unauthorizedHandler wiring in App.tsx) so clearing logic exists in
// exactly one place.
export function clearSession(): void {
  sessionGeneration++
  // Captured before anything clears it — see authApi.logout. Harmless when
  // this runs from the 401 interceptor with an already-invalid token: a 401
  // on /auth/logout is excluded from the unauthorized handler, so it cannot
  // loop.
  const token = useAuthStore.getState().token
  try { authApi.logout(token).catch(() => {}) } catch {}
  setApiToken(null)
  setRefreshToken('')
  clearApiCache()
  useAuthStore.setState({ token: '', refreshToken: '', user: null, isAuthenticated: false })
  void clearStoredAuth().catch(() => useAuthStore.setState({ persistenceError: 'Sessiyaning saqlangan nusxasini o‘chirib bo‘lmadi. Disk yoki tizim keychainini tekshiring.' }))
  // Pending writes remain encrypted under the outgoing account.
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
  return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'REFRESH_NETWORK_ERROR' || code === 'AUTH_UNAVAILABLE'
}

async function hydrateBlockCode() {
  const token = useAuthStore.getState().token
  const generation = sessionGeneration
  const current = useAuthStore.getState().user
  if (!current) {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false })
    return
  }
  let code: string | null = null
  try {
    code = current.scope === 'procurement' ? null : await window.electronAPI?.blockGet?.() ?? null
  } catch {
    code = null
  }
  if (generation !== sessionGeneration) return
  if (code) {
    useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, blockCode: code })
  }
  try {
    const { data } = await authApi.getMe()
    if (generation !== sessionGeneration) return
    if (data) {
      useAuthStore.getState().setUser({ ...data, blockCode: data.scope === 'procurement' ? null : (data as User).blockCode ?? code ?? null })
      applyBusinessDayHour(data as User)
    }
    useAuthStore.setState({ isAuthenticated: true, isLoading: false })
  } catch (err: unknown) {
    if (generation !== sessionGeneration) return
    if (isNetworkError(err) && (tokenExpiry(token) ?? 0) > Date.now()) {
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
