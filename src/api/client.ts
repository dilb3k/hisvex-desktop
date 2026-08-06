import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import rawAxios from 'axios'
import type {
  AuthResponse,
  AuthSuccess,
  DashboardData,
  DailySnapshot,
  DatabaseStats,
  Debtor,
  InventoryItem,
  InventorySummary,
  Product,
  SyncResponse,
  SyncPayload,
  User,
} from '../types'
import { getBusinessDate } from '../utils/businessDay'

interface InventoryResponse {
  items: InventoryItem[]
  summary?: InventorySummary
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://hisvex-prod-api.onrender.com/api'

let apiToken: string | null = null
let apiRefreshToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setApiToken(token: string | null) {
  apiToken = token
}

export function setRefreshToken(token: string | null) {
  apiRefreshToken = token
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

let tokensRefreshedHandler: ((token: string, refreshToken: string) => void) | null = null

export function setTokensRefreshedHandler(handler: ((token: string, refreshToken: string) => void) | null) {
  tokensRefreshedHandler = handler
}

const cache = new Map<string, { data: any; ts: number }>()
export function clearApiCache() { cache.clear() }
const CACHE_TTL = 30000

function cacheKey(config: { method?: string; url?: string; params?: any }) {
  return `${config.method}:${config.url}:${JSON.stringify(config.params ?? {})}`
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

function normalizeIds(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) { obj.forEach(normalizeIds); return }
  const o = obj as Record<string, unknown>
  if (o.id && !o._id) { o._id = o.id; delete o.id }
  for (const v of Object.values(o)) { if (v && typeof v === 'object') normalizeIds(v) }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (apiToken) {
    config.headers.Authorization = `Bearer ${apiToken}`
  }
  if (config.method === 'get') {
    const key = cacheKey(config)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      config.adapter = () => Promise.resolve({ data: hit.data, status: 200, statusText: 'OK', headers: {}, config })
    }
  }
  return config
})

let refreshPromise: Promise<'ok' | 'failed'> | null = null

function handleSessionExpired(
  error: AxiosError<{ success?: boolean; error?: { message?: string; details?: unknown }; message?: string }>,
): Error {
  apiToken = null
  apiRefreshToken = null
  cache.clear()
  try { localStorage.removeItem('hisvex_token') } catch {}
  try { localStorage.removeItem('hisvex_refresh') } catch {}
  try { localStorage.removeItem('hisvex_user') } catch {}
  unauthorizedHandler?.()
  window.location.hash = '#/login'
  const data = error.response?.data
  if (data && typeof data === 'object') {
    if ('error' in data && data.error && typeof data.error === 'object' && 'message' in data.error && typeof data.error.message === 'string') {
      return new Error(data.error.message)
    }
    if ('message' in data && typeof data.message === 'string') {
      return new Error(data.message)
    }
  }
  return new Error('Avtorizatsiya tugagan. Qayta kiring.')
}

api.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data
    }
    normalizeIds(response.data)
    if (response.config.method === 'get') {
      cache.set(cacheKey(response.config), { data: response.data, ts: Date.now() })
    } else {
      cache.clear()
    }
    return response
  },
  async (error: AxiosError<{ success?: boolean; error?: { message?: string; details?: unknown }; message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const url = originalRequest?.url ?? ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/logout')

    if (error.response?.status === 401 && !isAuthEndpoint && apiRefreshToken && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      const pending = refreshPromise ?? (refreshPromise = (async () => {
        try {
          const res = await rawAxios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken: apiRefreshToken })
          const body = res.data
          const data = body && typeof body === 'object' && 'success' in body && 'data' in body ? body.data : body
          const newToken: string = data.token
          const newRefresh: string = data.refreshToken

          apiToken = newToken
          apiRefreshToken = newRefresh
          try { localStorage.setItem('hisvex_token', newToken) } catch {}
          try { localStorage.setItem('hisvex_refresh', newRefresh) } catch {}
          tokensRefreshedHandler?.(newToken, newRefresh)
          return 'ok' as const
        } catch {
          return 'failed' as const
        }
      })().finally(() => { refreshPromise = null }))
      return pending.then((result) => {
        if (result === 'failed') {
          return Promise.reject(handleSessionExpired(error))
        }
        originalRequest.headers.Authorization = `Bearer ${apiToken ?? ''}`
        return api(originalRequest)
      })
    }

    if (error.response?.status === 401 && !isAuthEndpoint) {
      return Promise.reject(handleSessionExpired(error))
    }

    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error("So'rov vaqti tugadi. Internet aloqasini tekshiring."))
    }

    if (error.code === 'ERR_NETWORK') {
      return Promise.reject(new Error('Tarmoq xatoligi. Server bilan aloqa yo\'q.'))
    }

    const data = error.response?.data
    let message: string
    if (data && typeof data === 'object') {
      if ('error' in data && data.error && typeof data.error === 'object' && 'message' in data.error && typeof data.error.message === 'string') {
        message = data.error.message
      } else if ('message' in data && typeof data.message === 'string') {
        message = data.message
      } else {
        message = error.message || 'API xatoligi'
      }
    } else {
      message = error.message || 'API xatoligi'
    }

    return Promise.reject(new Error(message))
  },
)

export const authApi = {
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password, deviceId: getDeviceId() }),

  loginWithPhone: (username: string, password: string, phone_number: string) =>
    api.post<AuthSuccess>('/auth/login/verify-phone', { username, password, phone_number, deviceId: getDeviceId() }),

  register: (username: string, password: string, phone_number?: string, businessDayStartHour?: number) =>
    api.post<AuthSuccess>('/auth/register', {
      username,
      password,
      phone_number,
      ...(businessDayStartHour !== undefined ? { businessDayStartHour } : {}),
    }),

  logout: () => api.post('/auth/logout'),

  getMe: () => api.get<User>('/auth/me'),

  updateMe: (data: Partial<User>) => api.put('/auth/me', data),
}

export const productsApi = {
  getAll: (search?: string) =>
    api.get<Product[]>('/products', { params: { search } }),

  getById: (id: string) => api.get<Product>(`/products/${id}`),

  create: (data: Partial<Product>) => api.post<Product>('/products', data),

  update: (id: string, data: Partial<Product>) =>
    api.put<Product>(`/products/${id}`, data),

  delete: (id: string) => api.delete(`/products/${id}`),
}

let deviceId = ''
export function getDeviceId(): string {
  if (!deviceId) {
    try { deviceId = localStorage.getItem('hisvex_device_id') || '' } catch {}
    if (!deviceId) {
      deviceId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
      try { localStorage.setItem('hisvex_device_id', deviceId) } catch {}
    }
  }
  return deviceId
}

export const inventoryApi = {
  getByDate: (from: string, to: string) =>
    api.get<InventoryResponse>('/inventory', { params: { from, to } }),

  getDashboard: () => api.get<DashboardData>('/inventory/dashboard'),

  startDay: (items: { productId: string; startQuantity: number; currentQuantity?: number; note?: string; localId?: string; createdAt?: string; updatedAt?: string }[]) =>
    api.post('/inventory/start-day', { deviceId: getDeviceId(), date: getBusinessDate(), items }),

  bulkUpdate: (items: { productId: string; currentQuantity: number; note?: string }[]) =>
    api.put('/inventory/bulk-current', { deviceId: getDeviceId(), date: getBusinessDate(), items }),

  recordSales: (date: string, lines: { productId: string; quantity: number }[]) =>
    api.post('/inventory/sales', { date, deviceId: getDeviceId(), lines }),
}

export const snapshotsApi = {
  getDaily: (date: string) =>
    api.get<DailySnapshot>('/snapshots/daily', { params: { date } }),

  getRange: (from: string, to: string) =>
    api.get<DailySnapshot[]>('/snapshots/range', { params: { from, to } }),

  createDaily: (data: DailySnapshot) =>
    api.post<DailySnapshot>('/snapshots/daily', data),
}

export const syncApi = {
  sync: (payload: SyncPayload) => api.post<SyncResponse>('/sync', payload),
}

export const debtorsApi = {
  getAll: () => api.get<Debtor[]>('/debtors'),

  getById: (id: string) => api.get<Debtor>(`/debtors/${id}`),

  create: (data: Partial<Debtor>) => api.post<Debtor>('/debtors', data),

  update: (id: string, data: Partial<Debtor>) =>
    api.put<Debtor>(`/debtors/${id}`, data),

  adjust: (id: string, amount: number, note?: string) =>
    api.post(`/debtors/${id}/adjust`, {
      amount: Math.abs(amount),
      type: amount < 0 ? 'subtract' : 'add',
      note,
    }),

  delete: (id: string) => api.delete(`/debtors/${id}`),
}

export const adminsApi = {
  getAll: () => api.get<User[]>('/auth/admins'),

  create: (username: string, password: string, tier?: string, phone_number?: string) =>
    api.post('/auth/admins', { username, password, tier, phone_number }),

  update: (id: string, data: { username?: string; password?: string; tier?: string; phone_number?: string; isActive?: boolean }) =>
    api.put(`/auth/admins/${id}`, data),

  delete: (id: string) => api.delete(`/auth/admins/${id}`),

  bulkUpdateTier: (tier: 'tekin' | 'bor' | 'pro') =>
    api.put('/auth/users/tier', { tier }),

  getStats: () => api.get<DatabaseStats>('/stats'),
}

export const healthApi = {
  check: () => api.get('/health'),
}

const IMAGE_HASH_REGEX = /^[a-f0-9]{64}$/

export function resolveImageUrl(image?: string, imageHash?: string): string | undefined {
  const src = image || imageHash
  if (!src) return undefined
  if (src.startsWith('data:image/') || src.startsWith('https://') || src.startsWith('http://')) {
    return src
  }
  if (IMAGE_HASH_REGEX.test(src)) {
    return `${API_BASE_URL}/products/image/${src}`
  }
  return undefined
}

export default api
