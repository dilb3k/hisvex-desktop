export interface User {
  _id: string
  email?: string
  name?: string
  username: string
  phone_number?: string
  role: 'admin' | 'superAdmin'
  tier?: 'tekin' | 'bor' | 'pro'
  isPayed?: boolean
  isActive?: boolean
  businessDayStartHour?: number
  // A business-day hour change takes effect at the start of the next business
  // day rather than immediately, so the backend keeps the scheduled value
  // separately until then. Clients must mirror both (see
  // businessDay.ts's syncBusinessDayFromServer) or they compute a different
  // "today" than the server does.
  pendingBusinessDayStartHour?: number | null
  businessDayEffectiveFrom?: string | null
  blockCode?: string | null
  subscriptionEndDate?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface AuthSuccess {
  token: string
  refreshToken: string
  user: User
}

export interface AuthPhoneVerification {
  needsPhoneVerification: true
  maskedPhone: string
  message?: string
}

export type AuthResponse = AuthSuccess | AuthPhoneVerification

export type ProductUnit = 'dona' | 'kg'

export interface Product {
  _id: string
  localId?: string
  name: string
  quantity?: number
  /** Unit of measure — 'dona' is counted, 'kg' is weighed (fractions allowed). */
  unit?: ProductUnit
  buyPrice?: number
  sellPrice?: number
  image?: string
  displayIndex?: number
  barcodes?: string[]
  category?: string
  costPrice?: number
  sellingPrice?: number
  imageHash?: string
  createdAt?: string
  updatedAt?: string
}

export interface InventoryItem {
  _id: string
  productId: string
  product?: Product
  /** Denormalized from the product so history stays readable after deletion. */
  unit?: ProductUnit
  date: string
  startQuantity?: number
  currentQuantity: number
  openingQuantity?: number
  price?: number
  buyPrice?: number
  sellPrice?: number
  sold?: number
  revenue?: number
  realizedProfit?: number
  /**
   * Units already accounted for at a price other than the entry's list price
   * (a negotiated sale, a mid-day price correction). They sit outside the
   * `startQuantity - currentQuantity` derivation, which is why the day's true
   * opening stock is `startQuantity + lockedSold`. See the backend's
   * inventory.service.sales().
   */
  lockedRevenue?: number
  lockedProfit?: number
  lockedSold?: number
  createdAt?: string
  updatedAt?: string
}

export interface InventoryWithProduct extends InventoryItem {
  product: Product
}

export interface InventorySummary {
  totalStart: number
  totalCurrent: number
  totalSold: number
  totalRevenue: number
  totalProfit: number
  totalStockSellValue: number
  totalStockBuyValue: number
  totalStockProfit: number
}

export interface DashboardData {
  products: Product[]
  inventory: InventoryItem[]
  snapshot?: DailySnapshot
}

export interface DailySnapshot {
  _id: string
  date: string
  totalSales: number
  totalExpenses: number
  totalProfit: number
  totalRevenue?: number
  totalSoldItems?: number
  productSales: ProductSale[]
  items?: DailySnapshotItem[]
  createdAt?: string
}

export interface DailySnapshotItem {
  productId: string
  productName: string
  unit?: ProductUnit
  sold: number
  buyPrice?: number
  sellPrice?: number
  revenue: number
  profit: number
}

export interface ProductSale {
  productId: string
  productName?: string
  quantity: number
  revenue: number
}

export interface Debtor {
  _id: string
  name: string
  phone?: string
  amount: number
  note?: string
  notes?: string
  history?: DebtHistory[]
  createdAt?: string
  updatedAt?: string
}

export interface DebtHistory {
  amount: number
  type: 'add' | 'subtract'
  note?: string
  date: string
}

export interface InventoryMetrics {
  remaining: number
  sold: number
  revenue: number
  realizedProfit: number
  stockSellValue: number
  stockBuyValue: number
  potentialProfit: number
  marginPercent: number
}

export interface DatabaseStats {
  database: {
    name: string
    size: string
    storageSize: string
    indexSize: string
    totalSize: string
    collections: number
    objects: number
    avgObjectSize: string
  }
  records: {
    totalAdmins: number
    totalProducts: number
    totalInventory: number
    totalSnapshots: number
    totalDebtors: number
    totalSubscriptions: number
    totalActiveSubscriptions: number
    totalRecords: number
  }
  collections?: Record<string, { count: number; size: string }>
}

export interface SyncPayload {
  products?: Product[]
  inventory?: InventoryItem[]
  // Backend accepts either key for daily snapshots (sync.service.ts does
  // `payload.daily ?? payload.snapshots`) — `daily` is the canonical one,
  // `snapshots` kept for backward compatibility with older callers.
  daily?: DailySnapshot[]
  snapshots?: DailySnapshot[]
  lastSyncAt?: string
  limit?: number
  offset?: number
}

export interface SyncRejectedItem {
  entity: string
  localId: string
  reason: string
}

export interface SyncResponse {
  accepted: {
    products: number
    inventory: number
    snapshots: number
  }
  rejected: SyncRejectedItem[]
  products: Product[]
  inventory: InventoryItem[]
  daily: DailySnapshot[]
  hasMore: boolean
  serverTime: string
}
