import { roundMoney, roundQty } from './inventory'

/** A stock edit preserves prior sale prices and costs. Revenue overrides are day totals. */
export function inventoryAdjustment(entry: {
  startQuantity?: number; openingQuantity?: number; currentQuantity: number;
  lockedSold?: number; lockedRevenue?: number; lockedProfit?: number;
  buyPrice?: number; sellPrice?: number;
}, currentQuantity: number, statedRevenue?: number) {
  const start = entry.startQuantity ?? entry.openingQuantity ?? 0
  const derivedSold = roundQty(Math.max(start - currentQuantity, 0))
  const sold = roundQty((entry.lockedSold ?? 0) + derivedSold)
  const listRevenue = roundMoney((entry.lockedRevenue ?? 0) + derivedSold * (entry.sellPrice ?? 0))
  const cost = roundMoney((entry.lockedRevenue ?? 0) - (entry.lockedProfit ?? 0) + derivedSold * (entry.buyPrice ?? 0))
  const revenue = statedRevenue === undefined ? listRevenue : roundMoney(statedRevenue)
  const realizedProfit = roundMoney(revenue - cost)
  return {
    startQuantity: statedRevenue === undefined ? start : currentQuantity,
    currentQuantity,
    remaining: currentQuantity,
    stockSellValue: roundMoney(currentQuantity * (entry.sellPrice ?? 0)),
    stockBuyValue: roundMoney(currentQuantity * (entry.buyPrice ?? 0)),
    potentialProfit: roundMoney(currentQuantity * ((entry.sellPrice ?? 0) - (entry.buyPrice ?? 0))),
    lockedSold: statedRevenue === undefined ? (entry.lockedSold ?? 0) : sold,
    lockedRevenue: statedRevenue === undefined ? (entry.lockedRevenue ?? 0) : revenue,
    lockedProfit: statedRevenue === undefined ? (entry.lockedProfit ?? 0) : realizedProfit,
    sold, revenue, realizedProfit, listRevenue,
    soldNow: roundQty(entry.currentQuantity - currentQuantity),
  }
}

/** The editable amount belongs only to this new sale; earlier sales stay intact. */
export function inventorySaleAdjustment(entry: Parameters<typeof inventoryAdjustment>[0], currentQuantity: number, saleRevenue?: number) {
  const previous = inventoryAdjustment(entry, entry.currentQuantity)
  const listed = inventoryAdjustment(entry, currentQuantity)
  const listSaleRevenue = roundMoney(listed.revenue - previous.revenue)
  const next = inventoryAdjustment(entry, currentQuantity,
    listed.soldNow > 0 && saleRevenue !== undefined
      ? roundMoney(previous.revenue + saleRevenue) : undefined)
  return { ...next, listSaleRevenue, saleRevenue: roundMoney(next.revenue - previous.revenue) }
}
