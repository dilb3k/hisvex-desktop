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

export interface Product {
  _id: string
  localId?: string
  name: string
  quantity?: number
  buyPrice?: number
  sellPrice?: number
  image?: string
  displayIndex?: number
  barcodes?: string[]
  category?: string
  unit?: string
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
  snapshots?: DailySnapshot[]
  lastSyncAt?: string
}

export interface SyncResponse {
  products: Product[]
  inventory: InventoryItem[]
  snapshots: DailySnapshot[]
  debtors: Debtor[]
  serverTime: string
}
