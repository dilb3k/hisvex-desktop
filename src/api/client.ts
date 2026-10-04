import type { ProcurementReceipt, ProcurementSummary, ProcurementQuery, ProcurementHistoryQuery, ProcurementAnalytics } from '../utils/procurementTypes'
import { nativeBackendAdapter } from "./nativeAdapter";
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import rawAxios from 'axios'
import { createManualMutationRegistry, isDurableManualMutation, isDefinitiveMutationRejection, type ManualIntent } from '../utils/manualMutationIntent'
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
// Imported rather than redeclared: this file and constants/index.ts each held
// their own copy of the same fallback URL, so pointing the app at a different
// backend meant editing two places, and missing one would quietly send half
// the app to the old server.
import { getActiveUser } from '../store/offlineQueue'
import { API_BASE_URL, API_BACKUP_URL } from '../constants'
import { getBusinessDate } from '../utils/businessDay'
import { setStoredTokens, setStoredStaleToken } from '../utils/authStorage'

if(typeof window!=='undefined'&&window.electronAPI?.requestBackend) axios.defaults.adapter=nativeBackendAdapter

interface InventoryResponse {
  items: InventoryItem[]
  summary?: InventorySummary
}

const HEALTH_RECHECK_INTERVAL_MS = 3 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 10000
const HEAVY_TIMEOUT_MS = 60000

let isPrimaryDown = false
let healthRecheckTimer: ReturnType<typeof setInterval> | null = null

function activeApiBaseUrl(): string {
  return isPrimaryDown ? API_BACKUP_URL : API_BASE_URL
}

// Best-effort Telegram alert relay (backend's alertService) — the backend
// itself can't reliably alert on its own outage (no process running to send
// from while it's down), so the client reports what it just observed to
// whichever server is now the active one. Never awaited by a caller and
// never allowed to affect the failover flow it's reporting on: a failed
// alert call is just silently dropped.
function reportFailoverEvent(event: 'failover' | 'recovered', from: string, to: string): void {
  if (!apiToken) return
  const targetBase = event === 'failover' ? API_BACKUP_URL : API_BASE_URL
  void rawAxios
    .post(
      `${targetBase}/ops/failover`,
      { event, from, to },
      { timeout: 5000, headers: { Authorization: `Bearer ${apiToken}` } },
    )
    .catch(() => {
      // Best-effort — the admin misses one Telegram message, nothing else.
    })
}

// Once failed over, ping Railway's own /health directly (not through the
// `api` instance below — that would just get redirected to Render by the
// same interceptor that caused the failover) every 3 minutes. Stops itself
// once primary answers again; a later failure restarts it.
function scheduleHealthRecheck() {
  if (healthRecheckTimer) return
  healthRecheckTimer = setInterval(async () => {
    if (!isPrimaryDown) return
    try {
      const res = await rawAxios.get(`${API_BASE_URL}/health`, { timeout: 5000 })
      if (res.status === 200) {
        isPrimaryDown = false
        if (healthRecheckTimer) { clearInterval(healthRecheckTimer); healthRecheckTimer = null }
        console.log('[api] Primary (Railway) is back — switching off Render.')
        reportFailoverEvent('recovered', 'render', 'railway')
      }
    } catch {
      // Still down — try again next tick.
    }
  }, HEALTH_RECHECK_INTERVAL_MS)
}

// Railway's own edge router returns a plain 404 when the service itself is
// torn down / asleep / not deployed — e.g. {"status":"error","code":404,
// "message":"Application not found","request_id":"..."}. By status code
// alone this is indistinguishable from a completely normal business 404
// ("Mahsulot topilmadi"/404 from a real, running backend) — only fail over
// when the platform's own signature is actually present; an ordinary 4xx
// must reach the caller unchanged and must never be retried against backup.
const RAILWAY_NOT_FOUND_BODY_MARKER = 'Application not found'
function isRailwayPlatformNotFound(error: AxiosError): boolean {
  const response = error.response
  if (!response) return false
  let appBody = response.data;
  if (typeof appBody === 'string') { try { appBody = JSON.parse(appBody); } catch {} }
  if (appBody && typeof appBody === 'object' && typeof (appBody as {success?:unknown}).success === 'boolean') return false;
  if (response.headers?.['x-railway-router'] !== undefined) return true
  const data = response.data
  if (typeof data === 'string') return data.includes(RAILWAY_NOT_FOUND_BODY_MARKER)
  if (data && typeof data === 'object') {
    try { return JSON.stringify(data).includes(RAILWAY_NOT_FOUND_BODY_MARKER) } catch { return false }
  }
  return false
}

// Only a server that's actually unreachable/down should fail over — a 4xx is
// the client's own fault (bad input, expired auth, not found) and retrying it
// against a second server would just get the same answer twice. The one
// exception is a confirmed Railway-platform 404 (see above), which really
// does mean "nothing is listening here", not "the app said no".
function isFailoverTriggering(error: AxiosError): boolean {
  const status = error.response?.status
  if (status === 502 || status === 503 || status === 504) return true
  if (status === 404 && isRailwayPlatformNotFound(error)) return true
  // No response reached us at all — a genuine connection-level failure, not
  // this client's own request timeout (ECONNABORTED is handled separately,
  // deliberately excluded here: a slow-but-alive server isn't "down" the way
  // a dead one returning 502/no-response is).
  if (!error.response && error.code && error.code !== 'ECONNABORTED') return true
  return false
}

// FormData uploads and known report/range endpoints get more time than a
// normal read/write; the rest fail fast so a genuinely dead primary doesn't
// hang a request for a full minute before this client tries the backup.
function isHeavyRequest(config: InternalAxiosRequestConfig): boolean {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return true
  const url = config.url ?? ''
  return url.includes('/snapshots') || url.includes('/inventory/range') || url.includes('/stats') || url.includes('/procurements')
}

function sessionIdentity(token: string | null): string {
  if (!token) return ''
  try { const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return `${p.userId}:${p.sessionId??''}:${p.scope??'full'}:${p.securityVersion??0}` } catch { return token }
}
let authEpoch=0
let apiToken: string | null = null
let apiRefreshToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setApiToken(token: string | null) {
  if(sessionIdentity(token)!==sessionIdentity(apiToken)) {authEpoch++;refreshPromise=null}
  apiToken = token
  clearApiCache()
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
let cacheGeneration=0
export function clearApiCache() { cacheGeneration++;cache.clear() }
const CACHE_TTL = 30000

function cacheKey(config: { method?: string; url?: string; params?: any }) {
  return `${config.method}:${config.url}:${JSON.stringify(config.params ?? {})}`
}

const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

let manualLock: Promise<unknown> = Promise.resolve()
function manualRegistry(owner: string, epoch: number) {
  const assert = () => { if (owner !== getActiveUser() || epoch !== authEpoch) throw Error('Hisob yoki sessiya o‘zgardi') }
  const key = (slot: string) => `hisvex-manual-v1:${owner}:${slot}`
  return createManualMutationRegistry({
    read: async slot => { const raw = localStorage.getItem(key(slot)); return raw ? JSON.parse(raw) as ManualIntent : null },
    write: async (slot, value) => { assert(); if (value) localStorage.setItem(key(slot), JSON.stringify(value)); else localStorage.removeItem(key(slot)) },
    lock: (_slot, work) => { const run = manualLock.catch(() => {}).then(work); manualLock = run; return run },
  }, () => crypto.randomUUID(), async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join(''), assert)
}

function normalizeIds(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) { obj.forEach(normalizeIds); return }
  const o = obj as Record<string, unknown>
  if (o.id && !o._id) { o._id = o.id; delete o.id }
  for (const v of Object.values(o)) { if (v && typeof v === 'object') normalizeIds(v) }
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if((config as any)._authEpoch!==undefined && (config as any)._authEpoch!==authEpoch) throw Error('Sessiya o‘zgardi')
  ;(config as any)._authEpoch=authEpoch
  ;(config as any)._cacheGeneration=cacheGeneration
  const requestOwner = config.headers['X-Account-ID']
  if (requestOwner && requestOwner !== getActiveUser()) throw new Error('Hisob o‘zgardi')
  if (getActiveUser()) config.headers['X-Account-ID'] = getActiveUser()
  config.headers['X-Client-Protocol']='2'
  if (!config.headers['Idempotency-Key'] && isDurableManualMutation(config.method, config.url)) {
    const owner = getActiveUser()
    if (!owner) throw Error('Avval hisobga kiring')
    const registry = manualRegistry(owner, authEpoch)
    const slot = `${config.method}:${config.url}`
    const intent = await registry.claim(slot, { body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data, params: config.params })
    config.headers['Idempotency-Key'] = intent.id
    ;(config as any)._manualIntent = { registry, slot, id: intent.id }
  }
  if(!['get','head','options'].includes(config.method??'get')) config.headers['Idempotency-Key'] ??= crypto.randomUUID()
  if (apiToken) {
    config.headers.Authorization = `Bearer ${apiToken}`
  }
  // Re-evaluated on every dispatch so a failover that happened mid-session
  // applies to the very next call, including one being retried right below.
  config.baseURL = activeApiBaseUrl()
  if (!config.timeout) {
    config.timeout = isHeavyRequest(config) ? HEAVY_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
  }
  if (config.method === 'get') {
    const key = cacheKey(config)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      config.adapter = () => Promise.resolve({ data: hit.data, status: 200, statusText: 'OK', headers: { 'x-local-cache': 'hit' }, config })
    }
  }
  return config
})

let refreshPromise: Promise<'ok' | 'failed' | 'network' | 'changed'> | null = null

function handleSessionExpired(
  error: AxiosError<{ success?: boolean; error?: { message?: string; details?: unknown; code?: string }; message?: string }>,
): Error {
  const data = error.response?.data
  const code =
    data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object'
      ? (data.error as { code?: string }).code
      : undefined

  // This device got kicked because another device logged into the same
  // account — the token is dead for every normal call, but the server
  // still honors it (authenticate({ allowStale: true })) for the read-only
  // product/stock preview on the phone-verification screen. Stash it
  // before clearSession (below) wipes the live token.
  if (code === 'SESSION_REPLACED' && apiToken) {
    void setStoredStaleToken(apiToken).catch(() => {})
  }

  // Token/refreshToken/user clearing is owned by the shared session-clear
  // function (authStore.ts's clearSession), invoked via unauthorizedHandler
  // below — this avoids duplicating auth-persistence clearing logic here.
  unauthorizedHandler?.()
  window.location.hash = '#/login'
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
  async (response) => {
    if((response.config as any)._authEpoch!==authEpoch) throw Error('Hisob yoki sessiya o‘zgardi')
    if (response.config.headers['X-Account-ID'] && response.config.headers['X-Account-ID'] !== getActiveUser()) throw new Error('Hisob o‘zgardi')
    const manual = (response.config as any)._manualIntent
    if (manual && response.status !== 202 && response.data?.success !== false) await manual.registry.acknowledge(manual.slot, manual.id)
    const body = response.data
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data
    }
    normalizeIds(response.data)
    if (response.config.method === 'get' && !response.headers['x-local-cache'] && (response.config as any)._cacheGeneration===cacheGeneration) {
      cache.set(cacheKey(response.config), { data: response.data, ts: Date.now() })
    } else if (response.config.method !== 'get') {
      clearApiCache()
    }
    return response
  },
  async (error: AxiosError<{ success?: boolean; error?: { message?: string; details?: unknown }; message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _failoverRetried?: boolean }
    if(originalRequest && (originalRequest as any)._authEpoch!==authEpoch) return Promise.reject(Error('Hisob yoki sessiya o‘zgardi'))
    if (originalRequest?.headers['X-Account-ID'] && originalRequest.headers['X-Account-ID'] !== getActiveUser()) return Promise.reject(new Error('Hisob o‘zgardi'))
    const manual = (originalRequest as any)?._manualIntent
    if (manual && isDefinitiveMutationRejection(error.response?.status, error.response?.data)) await manual.registry.acknowledge(manual.slot, manual.id)
    const url = originalRequest?.url ?? ''
    const isAuthEndpoint = url.includes('/auth/verify-session-challenge') || url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/logout')

    // Primary looks down (502/503/504, or unreachable outright) — resend this
    // exact request (headers, auth, body — including a FormData image upload,
    // which the renderer's browser context keeps re-readable) against the
    // backup immediately. Applies to auth calls too. Only ever retried once
    // per request, so a backup that's *also* down surfaces as a normal error
    // instead of looping.
    if (originalRequest && originalRequest.baseURL === API_BASE_URL && ['get', 'head', 'options'].includes(originalRequest.method ?? '') && !originalRequest._failoverRetried && isFailoverTriggering(error)) {
      originalRequest._failoverRetried = true
      if (!isPrimaryDown) {
        isPrimaryDown = true
        scheduleHealthRecheck()
        console.warn('[api] Primary (Railway) unreachable — failing over to Render for this and subsequent requests.')
        reportFailoverEvent('failover', 'railway', 'render')
      }
      originalRequest.baseURL = API_BACKUP_URL
      return api(originalRequest)
    }
    if (originalRequest?.baseURL === API_BASE_URL && !isPrimaryDown && isFailoverTriggering(error)) {
      isPrimaryDown = true
      scheduleHealthRecheck()
      reportFailoverEvent('failover', 'railway', 'render')
    }

    if (error.response?.status === 401 && !isAuthEndpoint && apiRefreshToken && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshEpoch=authEpoch
      const refreshingToken=apiRefreshToken
      const previousToken=apiToken ?? ''
      const pending = refreshPromise ?? (refreshPromise = (async () => {
        try {
          const res = await rawAxios.post(`${activeApiBaseUrl()}/auth/refresh`, { refreshToken: refreshingToken }, { timeout: DEFAULT_TIMEOUT_MS })
          if(refreshEpoch!==authEpoch) return 'changed' as const
          const body = res.data
          const data = body && typeof body === 'object' && 'success' in body && 'data' in body ? body.data : body
          const newToken: string = data.token
          const newRefresh: string = data.refreshToken

          await setStoredTokens(newToken, newRefresh, previousToken)
          if(refreshEpoch!==authEpoch) return 'changed' as const
          apiToken = newToken
          apiRefreshToken = newRefresh
          tokensRefreshedHandler?.(newToken, newRefresh)
          return 'ok' as const
        } catch (refreshError:any) {
          if(refreshEpoch!==authEpoch) return 'changed' as const
          return [400,401,403].includes(refreshError?.response?.status)?'failed' as const:'network' as const
        }
      })().finally(() => { if(refreshEpoch===authEpoch) refreshPromise = null }))
      return pending.then((result) => {
        if(refreshEpoch!==authEpoch || result==='changed') return Promise.reject(Error('Hisob yoki sessiya o‘zgardi'))
        if(result==='network') return Promise.reject(Object.assign(Error('Tokenni yangilash uchun server bilan aloqa yo‘q'),{code:'REFRESH_NETWORK_ERROR'}))
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
      return Promise.reject(Object.assign(new Error("So'rov vaqti tugadi. Internet aloqasini tekshiring."), { code: 'ECONNABORTED' }))
    }

    if (error.code === 'ERR_NETWORK') {
      return Promise.reject(Object.assign(new Error('Tarmoq xatoligi. Server bilan aloqa yo\'q.'), { code: 'ERR_NETWORK' }))
    }

    const data = error.response?.data
    let message: string
    // Backend AppError codes (INVALID_SYNC_CURSOR / SYNC_RESET_REQUIRED /
    // SYNC_SCOPE_CHANGED, among others) used to be dropped here — only
    // `message` survived past this point, so syncEngine.ts had no way to
    // tell "cursor needs a reset" apart from any other sync failure and had
    // to treat all of them as a generic error. Preserved the same way
    // ECONNABORTED/ERR_NETWORK/REFRESH_NETWORK_ERROR already do above.
    let code: string | undefined
    if (data && typeof data === 'object') {
      if ('error' in data && data.error && typeof data.error === 'object' && 'message' in data.error && typeof data.error.message === 'string') {
        message = data.error.message
        code = (data.error as { code?: string }).code
      } else if ('message' in data && typeof data.message === 'string') {
        message = data.message
      } else {
        message = error.message || 'API xatoligi'
      }
    } else {
      message = error.message || 'API xatoligi'
    }

    return Promise.reject(code ? Object.assign(new Error(message), { code }) : new Error(message))
  },
)

export const authApi = {
  beginRegistrationPhone: () => api.post<{ token: string; botUrl: string; expiresAt: string }>('/auth/register/phone', {}),
  registrationPhoneStatus: (token: string) => api.post<{ verified: boolean; phone: string | null }>('/auth/register/phone/status', { token }),
  heartbeat: () => api.post('/auth/session/heartbeat', {}),
  loginProcurement: (username: string, password: string) => api.post<AuthSuccess>('/auth/login/procurement', { username, password }),
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password, deviceId: getDeviceId() }),

  loginWithPhone: (username: string, password: string, phone_number: string) =>
    api.post<AuthResponse>('/auth/login/verify-phone', { username, password, phone_number, deviceId: getDeviceId() }),

  // Completes the AuthOtpChallenge path login() can now return — see
  // types.ts. Success shape is identical to a normal login.
  verifySessionChallenge: (sessionChallengeId: string, otpCode: string) =>
    api.post<AuthSuccess>('/auth/verify-session-challenge', {
      sessionChallengeId,
      otpCode,
      deviceId: getDeviceId(),
    }),

  register: (username: string, password: string, phone_number?: string, businessDayStartHour?: number, phoneVerificationToken?: string) =>
    api.post<AuthSuccess>('/auth/register', {
      username,
      password,
      phone_number,
    phoneVerificationToken,
      deviceId: getDeviceId(),
      ...(businessDayStartHour !== undefined ? { businessDayStartHour } : {}),
    }),

  // Token passed explicitly: clearSession() clears apiToken synchronously,
  // but the request interceptor only reads it when the request is dispatched
  // a microtask later — so the logout went out unauthenticated, the server
  // answered 401, and activeSessionId was never released. The next login on
  // this account then demanded phone verification for a device that had
  // signed out cleanly.
  logout: (token?: string) =>
    api.post(
      '/auth/logout',
      undefined,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    ),

  getMe: () => api.get<User>('/auth/me'),

  updateMe: (data: Partial<User>) => api.put('/auth/me', data),

  // Read-only product/stock list for the phone-verification screen's "view
  // products" link. Takes the stale token explicitly rather than relying on
  // apiToken — same reasoning as logout()'s explicit token above: this call
  // happens precisely when this device is NOT the authenticated one.
  fetchProductPreview: (staleToken: string) =>
    api.get<{ productId: string; name: string; unit: string; sellPrice: number; currentQuantity: number }[]>(
      '/inventory-preview',
      { headers: { Authorization: `Bearer ${staleToken}` } },
    ),
}

export const productsApi = {
  getAll: (search?: string) =>
    api.get<Product[]>('/products', { params: { search } }),

  getById: (id: string) => api.get<Product>(`/products/${id}`),

  create: (data: Partial<Product>) => api.post<Product>('/products', data),

  update: (id: string, data: Partial<Product>) =>
    api.put<Product>(`/products/${id}`, data),

  restock: (id: string, quantity: number) =>
    api.patch<Product>(`/products/${id}/restock`, { quantity }),

  delete: (id: string,baseVersion:number) => api.delete(`/products/${id}`,{data:{baseVersion}}),

  // New R2-backed upload path (see backend's product.controller.ts). Sends
  // multipart/form-data with field name `image`, matching the server's
  // multer config. Response unwraps (via the response interceptor above) to
  // `{ product }`, with `product.imageUrl` populated. Errors: 422 (invalid/
  // missing file), 413 (>10MB), 503 (R2 not configured) — surfaced as plain
  // Error messages by the shared response interceptor, same as any other call.
  uploadProductImage: (id: string, file: File | Blob) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post<{ product: Product }>(`/products/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
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

  /**
   * `lineRevenue` restates the money taken for everything this edit counts as
   * sold (the "Kutilgan tushum" field). Profit follows from it automatically.
   */
  bulkUpdate: (items: { productId: string; currentQuantity: number; lineRevenue?: number; note?: string }[]) =>
    api.put('/inventory/bulk-current', { deviceId: getDeviceId(), date: getBusinessDate(), items }),

  /**
   * A line states what it actually brought in: `lineRevenue` is the money for
   * the whole line (exact — what a hand-typed cart total uses), `unitPrice` a
   * haggled per-unit price. Omit both to charge the list price.
   */
  recordSales: (
    date: string,
    lines: { productId: string; quantity: number; unitPrice?: number; lineRevenue?: number }[],
  ) =>
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
  sync: (payload: SyncPayload, owner: string) => api.post<SyncResponse>('/sync', payload, { headers: { 'X-Account-ID': owner } }),
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
  // Short dedicated timeout — this is a connectivity probe polled every
  // few seconds by utils/network.ts, not a real data fetch, so it should
  // fail fast when genuinely offline instead of hanging on the default
  // 15s request timeout.
  check: () => api.get('/health', { timeout: 5000 }),
}

const IMAGE_HASH_REGEX = /^[a-f0-9]{64}$/

export function resolveImageUrl(image?: string, imageHash?: string): string | undefined {
  const src = image || imageHash
  if (!src) return undefined
  if (src.startsWith('data:image/') || src.startsWith('https://') || src.startsWith('http://')) {
    return src
  }
  if (IMAGE_HASH_REGEX.test(src)) {
    // Legacy pre-R2 images live in Mongo, not R2 — reachable from whichever
    // backend is currently active since both read the same Atlas cluster.
    return `${activeApiBaseUrl()}/products/image/${src}`
  }
  return undefined
}

/**
 * Single source of truth for "what image do we show for this product".
 * Prefers the new R2-backed `imageUrl` (set once a product's image has been
 * uploaded via productsApi.uploadProductImage / the legacy base64 JSON path
 * on the new backend); falls back to the legacy `image`/`imageHash` resolver
 * for products that predate the R2 migration or were never re-saved.
 */
export function getProductImageSrc(
  product?: { image?: string; imageHash?: string; imageUrl?: string | null } | null,
): string | undefined {
  if (!product) return undefined
  if (product.imageUrl) return product.imageUrl
  return resolveImageUrl(product.image, product.imageHash)
}


export const procurementApi = {
  products: async () => {
    const { data } = await api.get<Product[]>('/products')
    return data.map(p => ({id:p.localId ?? p._id,name:p.name,unit:(p.unit ?? 'dona') as 'dona'|'kg',quantity:p.quantity ?? 0,buyPrice:p.buyPrice ?? 0,barcodes:p.barcodes ?? []}))
  },
  list: async (params?: ProcurementHistoryQuery) => (await api.get<ProcurementReceipt[]>('/procurements', {params})).data,
  detail: async (id: string) => (await api.get<ProcurementReceipt>(`/procurements/${encodeURIComponent(id)}`)).data,
  summary: async () => (await api.get<ProcurementSummary>('/procurements/summary')).data,
  analytics: async (params: ProcurementQuery) => (await api.get<ProcurementAnalytics>('/procurements/analytics', {params})).data,
  export: async (params: ProcurementQuery, format: 'csv'|'xlsx'|'pdf') => (await api.get<ArrayBuffer>('/procurements/export', {params:{...params,format},responseType:'arraybuffer'})).data,
  submit: async (id: string, items: import('../utils/procurementIntent').ProcurementItem[], supplier?: string) => {
    const { data } = await api.post<{procurement:{localId:string}}>('/procurements', {items,supplier}, {headers:{'Idempotency-Key':id}})
    return data.procurement
  },
}

export default api
