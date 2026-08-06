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
