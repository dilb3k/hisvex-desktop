import type { InventoryItem, Product, InventoryMetrics, ProductUnit } from '../types'

// Money formatting lives in one place — utils/formatters.ts — and is
// re-exported here so existing `from '../utils/inventory'` imports keep
// resolving.
export { formatMoney } from './formatters'

export interface ProductValidationErrors {
  name: string
  buyPrice: string
  sellPrice: string
  quantity: string
}

/* ── Units ────────────────────────────────────────────────────────────────
 * Mirrors the backend's utils/quantity.ts (and hisvex-web's lib/inventory.ts).
 * A product is either counted ("dona", whole numbers only) or weighed ("kg",
 * up to 3 decimals); every quantity that reaches arithmetic or an input field
 * goes through here so the platforms can't drift on what a valid quantity is.
 */

export const PRODUCT_UNITS: ProductUnit[] = ['dona', 'kg']
export const DEFAULT_UNIT: ProductUnit = 'dona'
export const QTY_DECIMALS = 3
const QTY_FACTOR = 10 ** QTY_DECIMALS
/** Sub-grid differences are float noise, not a real over-count. */
export const QTY_EPSILON = 1 / (QTY_FACTOR * 2)

export const normalizeUnit = (value?: string | null): ProductUnit =>
  value === 'kg' ? 'kg' : DEFAULT_UNIT

export const isWeighed = (unit?: string | null): boolean => normalizeUnit(unit) === 'kg'

export const roundQty = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * QTY_FACTOR) / QTY_FACTOR : 0

export const roundMoney = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0

/**
 * Round a *unit price* to whole so'm. So'm has no subunit in practice — every
 * price in the app is entered and shown as a whole number — so a discounted
 * per-unit price must land there too, otherwise a distributed discount emits
 * prices like 6666.67 and the recorded revenue picks up stray tiyin.
 */
export const roundPrice = (value: number): number =>
  Number.isFinite(value) ? Math.round(value) : 0

/**
 * Split a target amount across lines in proportion to what each contributes,
 * landing on the target EXACTLY.
 *
 * Rounding each share independently cannot do that — three shares of 25 000
 * round to 8333 each and sum to 24 999 — so the accumulated rounding error is
 * handed to the largest line, which is the one where a so'm is least visible.
 * The result is what gets sent as each line's revenue, so the total the
 * cashier typed is the total the report records.
 */
export const distributeTotal = (weights: number[], target: number): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0) return []
  if (sum <= 0) {
    // Nothing to weigh by (e.g. every line is already free): put it all on
    // the first line rather than dividing by zero.
    return weights.map((_, i) => (i === 0 ? roundMoney(target) : 0))
  }
  const shares = weights.map((w) => roundMoney((target * w) / sum))
  const drift = roundMoney(target - shares.reduce((a, b) => a + b, 0))
  if (drift !== 0) {
    let biggest = 0
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[biggest]) biggest = i
    shares[biggest] = roundMoney(shares[biggest] + drift)
  }
  return shares
}

export const normalizeQuantity = (value: number, unit?: string | null): number => {
  if (!Number.isFinite(value)) return 0
  const safe = Math.max(value, 0)
  return isWeighed(unit) ? roundQty(safe) : Math.round(safe)
}

export const qtyGreaterThan = (a: number, b: number): boolean => a - b > QTY_EPSILON

export const unitLabel = (unit?: string | null): string => normalizeUnit(unit)

/**
 * Sanitize raw text from a quantity field. "dona" keeps digits only; "kg"
 * additionally allows a single decimal separator, capped at 3 fraction digits,
 * so the field can never hold something the API would reject. Comma is
 * accepted and rewritten to a dot — it's the separator on a uz-UZ keyboard.
 */
export const normalizeQuantityInput = (value: string, unit?: string | null): string => {
  if (!isWeighed(unit)) return value.replace(/[^\d]/g, '')
  const cleaned = value.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('').slice(0, QTY_DECIMALS)}`
}

export const parseQuantityInput = (value: string, unit?: string | null): number => {
  const normalized = normalizeQuantityInput(value, unit)
  if (!normalized || normalized === '.') return 0
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? normalizeQuantity(parsed, unit) : 0
}

/** "2.5" / "22" — the number alone, trailing zeros trimmed. */
export const formatQuantityValue = (value: number, unit?: string | null): string => {
  const normalized = normalizeQuantity(value, unit)
  return isWeighed(unit)
    ? String(Number(normalized.toFixed(QTY_DECIMALS)))
    : normalized.toLocaleString('uz-UZ')
}

/** "2.5 kg" / "22 dona" — the number with its unit, for display. */
export const formatQuantity = (value: number, unit?: string | null): string =>
  `${formatQuantityValue(value, unit)} ${unitLabel(unit)}`

/** How much one tap of +/- moves a quantity, per unit. */
export const stepFor = (unit?: string | null): number => (isWeighed(unit) ? 0.1 : 1)

export const normalizeDigits = (value: string): string =>
  value.replace(/[^\d]/g, '')

export const resolveSellPrice = (item: { sellPrice?: number; price?: number }, product?: { sellPrice?: number; sellingPrice?: number }): number =>
  item.sellPrice ?? item.price ?? product?.sellPrice ?? product?.sellingPrice ?? 0

export const resolveBuyPrice = (item: { buyPrice?: number }, product?: { buyPrice?: number; costPrice?: number }): number =>
  item.buyPrice ?? product?.buyPrice ?? product?.costPrice ?? 0

export const hasValidationErrors = (errors: ProductValidationErrors): boolean =>
  Object.values(errors).some((error) => error !== '')

export const validateProductInput = (input: {
  name: string
  quantity: number
  buyPrice: number
  sellPrice: number
  unit?: ProductUnit
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
  } else if (!isWeighed(input.unit) && !Number.isInteger(input.quantity)) {
    errors.quantity = 'Dona bilan o\'lchanadigan mahsulot butun son bo\'lishi kerak'
  }

  return errors
}

export const getInventoryMetrics = (
  item: InventoryItem & { product?: Product },
): InventoryMetrics => {
  const storedSellPrice = item.sellPrice ?? item.price ?? item.product?.sellPrice ?? item.product?.sellingPrice ?? 0
  const storedBuyPrice = item.buyPrice ?? item.product?.buyPrice ?? item.product?.costPrice ?? 0

  const remaining = roundQty(Math.max(item.currentQuantity, 0))
  const start = roundQty(Math.max(item.startQuantity ?? item.openingQuantity ?? 0, 0))
  const sold = roundQty(Math.max(item.sold ?? (start - remaining), 0))
  // Server figures win when present: units sold at a negotiated price are
  // valued in the entry's locked accumulators, which sold x list price cannot
  // reproduce locally.
  const revenue = roundMoney(Math.max(item.revenue ?? sold * storedSellPrice, 0))
  const realizedProfit = roundMoney(item.realizedProfit ?? sold * (storedSellPrice - storedBuyPrice))
  const stockSellValue = roundMoney(remaining * storedSellPrice)
  const stockBuyValue = roundMoney(remaining * storedBuyPrice)
  const potentialProfit = roundMoney(remaining * (storedSellPrice - storedBuyPrice))

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

// Guards against saving a "remaining" quantity greater than the day's
// opening quantity (or below zero) — mirrors mobile's
// `clampCurrentQuantity` in `src/utils/inventory.ts` exactly (same formula)
// so the two platforms can't silently diverge on this edge case. Used both
// as the inline modal validation check (block save, show an error) and as a
// last-resort guard at the point the value is actually applied/persisted,
// so a bad value can never be saved even if the UI check is bypassed.
export const clampCurrentQuantity = (
  quantity: number,
  startQuantity: number,
): number => roundQty(Math.min(Math.max(quantity, 0), startQuantity))

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
    start: roundQty(totalStart), current: roundQty(totalCurrent), sold: roundQty(totalSold),
    revenue: roundMoney(totalRevenue), profit: roundMoney(totalProfit),
    stockSellValue: roundMoney(totalStockSellValue), stockBuyValue: roundMoney(totalStockBuyValue),
    stockProfit: roundMoney(totalStockProfit),
  }
}
