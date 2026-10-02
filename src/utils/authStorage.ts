import type { User } from '../types'

// Credentials cross the trusted IPC bridge and are encrypted by the OS keychain.
function bridge() {
  if (!window.electronAPI) throw Error('Xavfsiz Desktop saqlovi mavjud emas')
  return window.electronAPI
}

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = { ...(raw as Record<string, unknown>) }
  if (!parsed._id && !parsed.id) return null
  if (!parsed._id) parsed._id = parsed.id
  return parsed as unknown as User
}

export const getStoredToken = async () => (await bridge().getToken()) || ''
export const setStoredToken = async (token: string) => bridge().setToken(token)
export const clearStoredToken = async () => bridge().clearToken()
export const getStoredRefreshToken = async () => (await bridge().getRefreshToken()) || ''
export const setStoredRefreshToken = async (token: string) => bridge().setRefreshToken(token)
export const clearStoredRefreshToken = async () => bridge().clearRefreshToken()
export const getStoredStaleToken = async () => (await bridge().getStaleToken()) || ''
export const setStoredStaleToken = async (token: string) => bridge().setStaleToken(token)
export const clearStoredStaleToken = async () => bridge().clearStaleToken()
export const getStoredUser = async () => normalizeUser(await bridge().getUser())
export const setStoredUser = async (user: User) => bridge().setUser(user)
export const clearStoredUser = async () => bridge().clearUser()

export interface StoredAuth { token: string; refreshToken: string; user: User | null }

export async function writeStoredAuth(auth: StoredAuth): Promise<void> {
  await bridge().setAuth(auth)
}
export async function setStoredTokens(token: string, refreshToken: string, expectedToken: string): Promise<void> {
  await bridge().setTokens({ token, refreshToken, expectedToken })
}

export function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch { return null }
}

export async function readStoredAuth(): Promise<StoredAuth | null> {
  const stored = await bridge().getAuth()
  const token = stored.token
  if (!token) return null
  const refreshToken = stored.refreshToken
  const user = normalizeUser(stored.user)
  let owner: string | undefined
  try { owner = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).userId } catch {}
  if (!user || !owner || owner !== user._id) throw Error('Saqlangan sessiya hisobga mos emas. Qayta kiring.')
  return { token, refreshToken, user }
}

export async function clearStoredAuth(): Promise<void> {
  await bridge().clearAuth()
}
