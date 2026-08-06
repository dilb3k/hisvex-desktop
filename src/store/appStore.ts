import { create } from 'zustand'
import type { DashboardData, DailySnapshot, Debtor, InventoryItem, InventorySummary, InventoryWithProduct, Product } from '../types'
import { inventoryApi, productsApi, debtorsApi, snapshotsApi, clearApiCache } from '../api/client'
import { getBusinessDate } from '../utils/businessDay'
import { getInventoryTotals } from '../utils/inventory'

interface LoadingState {
  products: boolean
  inventory: boolean
  debtors: boolean
  snapshots: boolean
  dashboard: boolean
}

interface ToastState {
  visible: boolean
  message: string
  type: 'success' | 'error' | 'info'
}

const inflightKeys = new Set<string>()
const lastLoadTime: Record<string, number> = {}
let toastTimeoutId: ReturnType<typeof setTimeout> | null = null

interface AppState {
  products: Product[]
  inventory: InventoryItem[]
  inventoryPerDateCache: Record<string, { items: InventoryItem[]; summary?: InventorySummary; fetchedAt: number }>
  dashboard: DashboardData | null
  snapshots: DailySnapshot[]
  debtors: Debtor[]
  isSyncing: boolean
  error: string | null
  loading: LoadingState
  selectedDate: string
  inventorySummary: InventorySummary | null
  refreshKey: number
  toast: ToastState

  loadDashboard: () => Promise<void>
  loadProducts: (force?: boolean) => Promise<void>
  loadDebtors: () => Promise<void>
  loadSnapshots: (from: string, to: string) => Promise<void>
  loadInventoryByDate: (date: string) => Promise<void>
  setSelectedDate: (date: string) => void
  getInventoryTotals: () => { start: number; current: number; sold: number; revenue: number; profit: number; stockSellValue: number; stockBuyValue: number; stockProfit: number }
  setError: (error: string | null) => void
  clearError: () => void
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  hideToast: () => void
  refreshAll: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  products: [],
  inventory: [],
  inventoryPerDateCache: {},
  dashboard: null,
  snapshots: [],
  debtors: [],
  isSyncing: false,
  error: null,
  loading: {
    products: false,
    inventory: false,
    debtors: false,
    snapshots: false,
    dashboard: false,
  },
  selectedDate: getBusinessDate(),
  inventorySummary: null,
  refreshKey: 0,
  toast: { visible: false, message: '', type: 'info' },

  loadDashboard: async () => {
    set((state) => ({ loading: { ...state.loading, dashboard: true }, error: null }))
    try {
      const { data } = await inventoryApi.getDashboard()
      const today = getBusinessDate()
      set({
        dashboard: data,
        products: data.products,
        inventory: data.inventory,
        selectedDate: today,
        inventoryPerDateCache: {
          [today]: { items: data.inventory, summary: undefined, fetchedAt: Date.now() },
        },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dashboard yuklanmadi'
      set({ error: message })
    } finally {
      set((state) => ({ loading: { ...state.loading, dashboard: false } }))
    }
  },

  loadProducts: async (force?: boolean) => {
    const { products, loading } = get()
    if (!force && (products.length > 0 || loading.products)) return
    set((state) => ({ loading: { ...state.loading, products: true }, error: null }))
    try {
      const { data } = await productsApi.getAll()
      set({ products: data })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mahsulotlar yuklanmadi'
      set({ error: message })
    } finally {
      set((state) => ({ loading: { ...state.loading, products: false } }))
    }
  },

  loadInventoryByDate: async (date: string) => {
    const cacheKey = `inv:${date}`
    if (inflightKeys.has(cacheKey)) return
    const now = Date.now()
    const lastLoad = lastLoadTime[cacheKey]
    const cached = get().inventoryPerDateCache[date]
    if (lastLoad && now - lastLoad < 30000 && cached) return
    inflightKeys.add(cacheKey)
    set({ error: null })
    try {
      const { data } = await inventoryApi.getByDate(date, date)
      lastLoadTime[cacheKey] = Date.now()
      set((state) => ({
        inventoryPerDateCache: {
          ...state.inventoryPerDateCache,
          [date]: { items: data.items, summary: data.summary, fetchedAt: Date.now() },
        },
        inventory: date === get().selectedDate ? data.items : state.inventory,
        inventorySummary: date === get().selectedDate ? (data.summary ?? null) : state.inventorySummary,
      }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ombor ma\'lumotlari yuklanmadi'
      set({ error: message })
    } finally {
      inflightKeys.delete(cacheKey)
    }
  },

  loadDebtors: async () => {
    set((state) => ({ loading: { ...state.loading, debtors: true }, error: null }))
    try {
      const { data } = await debtorsApi.getAll()
      set({ debtors: data })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Qarzdorlar yuklanmadi'
      set({ error: message })
    } finally {
      set((state) => ({ loading: { ...state.loading, debtors: false } }))
    }
  },

  loadSnapshots: async (from, to) => {
    const cacheKey = `snap:${from}:${to}`
    if (inflightKeys.has(cacheKey)) return
    inflightKeys.add(cacheKey)
    set((state) => ({ loading: { ...state.loading, snapshots: true }, error: null }))
    try {
      const { data } = await snapshotsApi.getRange(from, to)
      set({ snapshots: data })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Snapshotlar yuklanmadi'
      set({ error: message })
    } finally {
      inflightKeys.delete(cacheKey)
      set((state) => ({ loading: { ...state.loading, snapshots: false } }))
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  getInventoryTotals: () => {
    const { inventory } = get()
    return getInventoryTotals(inventory)
  },

  refreshAll: async () => {
    clearApiCache()
    Object.keys(lastLoadTime).forEach((key) => delete lastLoadTime[key])
    set((state) => ({ refreshKey: state.refreshKey + 1, inventoryPerDateCache: {} }))
    await Promise.all([
      get().loadProducts(true),
      get().loadInventoryByDate(get().selectedDate || getBusinessDate()),
    ])
  },

  showToast: (message, type = 'info') => {
    if (toastTimeoutId) clearTimeout(toastTimeoutId)
    set({ toast: { visible: true, message, type } })
    toastTimeoutId = setTimeout(() => {
      set({ toast: { visible: false, message: '', type: 'info' } })
      toastTimeoutId = null
    }, 3000)
  },

  hideToast: () => {
    if (toastTimeoutId) clearTimeout(toastTimeoutId)
    toastTimeoutId = null
    set({ toast: { visible: false, message: '', type: 'info' } })
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}))
