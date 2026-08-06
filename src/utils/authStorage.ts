import type { User } from '../types'

// Single source of truth for auth persistence (token/refreshToken/user).
// Backed by the electron-store via IPC (electron/ipc.ts + electron/preload.ts),
// never plaintext localStorage.

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Record<string, unknown>
  if (!parsed._id && !parsed.id) return null
  if (!parsed._id && parsed.id) parsed._id = parsed.id
  return parsed as unknown as User
}

export async function getStoredToken(): Promise<string> {
  try {
    return (await window.electronAPI?.getToken?.()) || ''
  } catch {
    return ''
  }
}

export async function setStoredToken(token: string): Promise<void> {
  try {
    await window.electronAPI?.setToken?.(token)
  } catch {}
}

export async function clearStoredToken(): Promise<void> {
  try {
    await window.electronAPI?.clearToken?.()
  } catch {}
}

export async function getStoredRefreshToken(): Promise<string> {
  try {
    return (await window.electronAPI?.getRefreshToken?.()) || ''
  } catch {
    return ''
  }
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  try {
    await window.electronAPI?.setRefreshToken?.(token)
  } catch {}
}

export async function clearStoredRefreshToken(): Promise<void> {
  try {
    await window.electronAPI?.clearRefreshToken?.()
  } catch {}
}

export async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await window.electronAPI?.getUser?.()
    return normalizeUser(raw)
  } catch {
    return null
  }
}

export async function setStoredUser(user: User): Promise<void> {
  try {
    await window.electronAPI?.setUser?.(user)
  } catch {}
}

export async function clearStoredUser(): Promise<void> {
  try {
    await window.electronAPI?.clearUser?.()
  } catch {}
}

export interface StoredAuth {
  token: string
  refreshToken: string
  user: User | null
}

export async function readStoredAuth(): Promise<StoredAuth | null> {
  const token = await getStoredToken()
  if (!token) return null
  const [refreshToken, user] = await Promise.all([getStoredRefreshToken(), getStoredUser()])
  return { token, refreshToken, user }
}

export async function clearStoredAuth(): Promise<void> {
  await Promise.all([clearStoredToken(), clearStoredRefreshToken(), clearStoredUser()])
}
