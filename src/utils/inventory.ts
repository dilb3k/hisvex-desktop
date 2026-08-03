import type { InventoryItem, Product, InventoryMetrics } from '../types'

export interface ProductValidationErrors {
  name: string
  buyPrice: string
  sellPrice: string
  quantity: string
}

export const normalizeDigits = (value: string): string =>
  value.replace(/[^\d]/g, '')

export const parseWholeNumber = (value: string): number => {
  const normalized = normalizeDigits(value)
  return normalized ? parseInt(normalized, 10) : 0
}

export const formatWholeNumber = (value: number): string =>
  value.toLocaleString('uz-UZ')

export const formatMoney = (value: number): string =>
  `${value.toLocaleString('uz-UZ')} so'm`

export const hasValidationErrors = (errors: ProductValidationErrors): boolean =>
  Object.values(errors).some((error) => error !== '')

export const validateProductInput = (input: {
  name: string
  quantity: number
  buyPrice: number
  sellPrice: number
}): ProductValidationErrors => {
  const errors: ProductValidationErrors = {
    name: '',
    buyPrice: '',
    sellPrice: '',
    quantity: '',
  }

  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'Mahsulot nomi majburiy'
  } else if (input.name.trim().length < 2) {
    errors.name = 'Mahsulot nomi kamida 2 ta belgidan iborat bo\'lishi kerak'
  }

  if (!input.buyPrice || input.buyPrice <= 0) {
    errors.buyPrice = 'Sotib olish narxi 0 dan katta bo\'lishi kerak'
  }

  if (!input.sellPrice || input.sellPrice <= 0) {
    errors.sellPrice = 'Sotish narxi 0 dan katta bo\'lishi kerak'
  } else if (input.sellPrice < input.buyPrice) {
    errors.sellPrice = 'Sotish narxi sotib olish narxidan kam bo\'lmasligi kerak'
  }

  if (input.quantity < 0) {
    errors.quantity = 'Miqdor manfiy bo\'lmasligi kerak'
  }

  return errors
}

export const getInventoryMetrics = (
  item: InventoryItem & { product?: Product },
): InventoryMetrics => {
  const storedSellPrice = item.sellPrice ?? item.price ?? item.product?.sellPrice ?? item.product?.sellingPrice ?? 0
  const storedBuyPrice = item.buyPrice ?? item.product?.buyPrice ?? item.product?.costPrice ?? 0

  const remaining = Math.max(item.currentQuantity, 0)
  const start = Math.max(item.startQuantity ?? item.openingQuantity ?? 0, 0)
  const sold = Math.max(item.sold ?? (start - Math.max(item.currentQuantity, 0)), 0)
  const revenue = Math.max(item.revenue ?? sold * storedSellPrice, 0)
  const realizedProfit = item.realizedProfit ?? sold * (storedSellPrice - storedBuyPrice)
  const stockSellValue = remaining * storedSellPrice
  const stockBuyValue = remaining * storedBuyPrice
  const potentialProfit = remaining * (storedSellPrice - storedBuyPrice)

  return {
    remaining,
    sold,
    revenue,
    realizedProfit,
    stockSellValue,
    stockBuyValue,
    potentialProfit,
    marginPercent:
      storedSellPrice > 0
        ? Math.round(((storedSellPrice - storedBuyPrice) / storedSellPrice) * 100)
        : 0,
  }
}

export interface InventoryTotals {
  start: number
  current: number
  sold: number
  revenue: number
  profit: number
  stockSellValue: number
  stockBuyValue: number
  stockProfit: number
}

export const getInventoryTotals = (items: (InventoryItem & { product?: Product })[]): InventoryTotals => {
  if (items.length === 0) {
    return {
      start: 0, current: 0, sold: 0, revenue: 0, profit: 0,
      stockSellValue: 0, stockBuyValue: 0, stockProfit: 0,
    }
  }

  let totalStart = 0
  let totalCurrent = 0
  let totalSold = 0
  let totalRevenue = 0
  let totalProfit = 0
  let totalStockSellValue = 0
  let totalStockBuyValue = 0
  let totalStockProfit = 0

  for (const item of items) {
    const metrics = getInventoryMetrics(item)
    totalStart += item.startQuantity ?? item.openingQuantity ?? 0
    totalCurrent += metrics.remaining
    totalSold += metrics.sold
    totalRevenue += metrics.revenue
    totalProfit += metrics.realizedProfit
    totalStockSellValue += metrics.stockSellValue
    totalStockBuyValue += metrics.stockBuyValue
    totalStockProfit += metrics.potentialProfit
  }

  return {
    start: totalStart, current: totalCurrent, sold: totalSold,
    revenue: totalRevenue, profit: totalProfit,
    stockSellValue: totalStockSellValue, stockBuyValue: totalStockBuyValue,
    stockProfit: totalStockProfit,
  }
}
