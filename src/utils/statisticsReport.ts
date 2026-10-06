import {
  getInventoryMetrics,
  resolveBuyPrice,
  resolveSellPrice,
  normalizeUnit,
  roundQty,
  roundMoney,
  formatQuantity,
} from './inventory'
import { formatUnitQuantities, sumQuantities } from './quantities'
import { escapeCsvCell } from './csv'
import type { ProductUnit } from '../types'

export function statisticsReportRows(
  items: any[],
  labels: string[],
  totalLabel: string,
) {
  const products = new Map<
    string,
    {
      name: string
      unit: ProductUnit
      sold: number
      revenue: number
      profit: number
      remaining: number
      buy: number
      sell: number
      date: string
    }
  >()
  for (const item of items) {
    const id = item.product?._id || item.product?.id || item.productId
    if (!id) continue
    const metrics = getInventoryMetrics(item)
    const row = products.get(id) ?? {
      name: item.product?.name ?? '—',
      unit: normalizeUnit(item.unit ?? item.product?.unit),
      sold: 0,
      revenue: 0,
      profit: 0,
      remaining: 0,
      buy: 0,
      sell: 0,
      date: '',
    }
    row.sold += metrics.sold
    row.revenue += metrics.revenue
    row.profit += metrics.realizedProfit
    if ((item.date ?? '') >= row.date) {
      row.date = item.date ?? ''
      row.remaining = Math.max(0, item.currentQuantity ?? 0)
      row.buy = resolveBuyPrice(item, item.product)
      row.sell = resolveSellPrice(item, item.product)
    }
    products.set(id, row)
  }
  const sorted = Array.from(products.values()).sort(
    (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
  )
  const rows: (string | number)[][] = [labels]
  sorted.forEach((p, i) =>
    rows.push([
      i + 1,
      p.name,
      roundMoney(p.buy),
      roundMoney(p.sell),
      formatQuantity(roundQty(p.sold), p.unit),
      roundMoney(p.revenue),
      roundMoney(p.profit),
      formatQuantity(roundQty(p.remaining), p.unit),
      roundMoney(p.remaining * p.sell),
    ]),
  )
  rows.push([
    '',
    totalLabel,
    '',
    '',
    formatUnitQuantities(
      sumQuantities(sorted.map((p) => ({ quantity: p.sold, unit: p.unit }))),
    ),
    roundMoney(sorted.reduce((n, p) => n + p.revenue, 0)),
    roundMoney(sorted.reduce((n, p) => n + p.profit, 0)),
    formatUnitQuantities(
      sumQuantities(
        sorted.map((p) => ({ quantity: p.remaining, unit: p.unit })),
      ),
    ),
    roundMoney(sorted.reduce((n, p) => n + p.remaining * p.sell, 0)),
  ])
  return rows
}

export function statisticsReportCsv(
  items: any[],
  labels: string[],
  totalLabel: string,
) {
  return (
    '\uFEFFsep=,\r\n' +
    statisticsReportRows(items, labels, totalLabel)
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n')
  )
}
