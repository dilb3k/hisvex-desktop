export type ProcurementPeriod = 'day' | 'week' | 'month' | 'year' | 'custom'
export type ProcurementQuery = {
  period?: ProcurementPeriod
  from?: string
  to?: string
  supplier?: string
}
export type ProcurementHistoryQuery = {
  from?: string
  to?: string
  supplier?: string
  product?: string
  page?: number
  limit?: number
}
export type ProcurementCatalogProduct = {
  id: string
  name: string
  unit: 'dona' | 'kg'
  quantity: number
  buyPrice: number
  barcodes?: string[]
}
export type ProcurementReceipt = {
  localId: string
  date: string
  totalCost: number
  supplier?: string
  createdAt?: string
  createdByUsername?: string
  createdByUserId?: string
  createdByScope?: 'full' | 'procurement'
  items?: {
    productId: string
    name: string
    unit: 'dona' | 'kg'
    quantity: number
    buyPrice: number
    lineCost: number
    previousBuyPrice?: number
    isNewProduct: boolean
  }[]
}
export type ProcurementSummary = {
  date: string
  todaySpend: number
  monthSpend: number
  lastBatch: {
    localId: string
    date: string
    totalCost: number
    lineCount: number
    quantities: { dona: number; kg: number }
  } | null
}
export type ProcurementAnalytics = {
  from: string
  to: string
  period: ProcurementPeriod
  granularity: 'day' | 'month'
  supplier: string | null
  generatedAt: string
  inventoryValuation: string
  salesBasis: string
  totalProcurementSpend: number
  totalItemsProcured: { dona: number; kg: number }
  totalBatchesCount: number
  averageBatchValue: number
  totalRevenue: number
  grossProfit: number
  costOfGoodsSold: number
  cashFlowBalance: number
  inventoryValue: number
  costTrends: {
    date: string
    spend: number
    batches: number
    revenue: number
    grossProfit: number
  }[]
  topCostProducts: {
    productId: string
    name: string
    unit: 'dona' | 'kg'
    quantity: number
    totalCost: number
    averageBuyPrice: number
    firstBuyPrice: number
    previousBuyPrice: number | null
    latestBuyPrice: number
    priceChangePercent: number | null
  }[]
}
export const procurementMoney = (v: number) =>
  v.toLocaleString('uz-UZ', { maximumFractionDigits: 2 })
export const procurementQuantity = (
  items: { unit: 'dona' | 'kg'; quantity: number }[],
) =>
  items.reduce(
    (v, item) => ({
      ...v,
      [item.unit]: Math.round((v[item.unit] + item.quantity) * 1000) / 1000,
    }),
    { dona: 0, kg: 0 },
  )
export const priceChange = (previous: number, next: number) =>
  previous > 0 && Number.isFinite(next)
    ? Math.round((next / previous - 1) * 10000) / 100
    : null
