import { create } from 'zustand'
import { setApiToken, setRefreshToken, clearApiCache, authApi } from '../api/client'
import type { User } from '../types'

const STORAGE_KEY_TOKEN = 'hisvex_token'
const STORAGE_KEY_REFRESH = 'hisvex_refresh'
const STORAGE_KEY_USER = 'hisvex_user'

function persistToken(token: string) {
  try { localStorage.setItem(STORAGE_KEY_TOKEN, token) } catch {}
}

function persistRefreshToken(token: string) {
  try { localStorage.setItem(STORAGE_KEY_REFRESH, token) } catch {}
}

function withoutBlockCode(user: User): User {
  const { blockCode: _, ...rest } = user
  return rest as User
}

function persistUser(user: User) {
  try { localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(withoutBlockCode(user))) } catch {}
}

function clearPersistedToken() {
  try { localStorage.removeItem(STORAGE_KEY_TOKEN) } catch {}
  try { localStorage.removeItem(STORAGE_KEY_REFRESH) } catch {}
  try { localStorage.removeItem(STORAGE_KEY_USER) } catch {}
}

function readPersistedToken(): { token: string; refreshToken: string; user: User | null } | null {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) return null
    const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH) || ''
    let user: User | null = null
    const raw = localStorage.getItem(STORAGE_KEY_USER)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?._id || parsed?.id) {
        if (!parsed._id && parsed.id) parsed._id = parsed.id
        user = parsed
      }
    }
    return { token, refreshToken, user }
  } catch {
    return null
  }
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
  hydrate: () => void
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
    set({ token, refreshToken, user: normalized, isAuthenticated: true })
  },

  setUser: (user) => {
    persistUser(user)
    set({ user })
  },

  logout: () => {
    setApiToken(null)
    setRefreshToken('')
    clearApiCache()
    clearPersistedToken()
    set({ token: '', refreshToken: '', user: null, isAuthenticated: false })
  },

  setLoading: (isLoading) => set({ isLoading }),

  hydrate: () => {
    try {
      const result = readPersistedToken()
      if (result?.token) {
        setApiToken(result.token)
        setRefreshToken(result.refreshToken)
        set({ token: result.token, refreshToken: result.refreshToken, user: result.user ?? null, isAuthenticated: true, isLoading: false })
        hydrateBlockCode()
      } else {
        set({ isLoading: false })
      }
    } catch {
      set({ isLoading: false })
    }
  },
}))

async function hydrateBlockCode() {
  const current = useAuthStore.getState().user
  if (!current) return
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
    }
  } catch {
    // offline — keep persisted user
  }
}
