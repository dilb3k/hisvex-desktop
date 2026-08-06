import dayjs from 'dayjs'
import { resolveBuyPrice, resolveSellPrice } from './inventory'
import type { ChartBucket } from '../components/StatBarChart'

// Safety caps so a corrupted/huge date range can never spin these loops —
// ~5.5 years of days / ~16 years of months, comfortably beyond any realistic
// report range in this app.
const MAX_DAYS = 2000
const MAX_MONTHS = 200

function itemMetrics(item: any): { revenue: number; profit: number; qty: number } {
  const p = item?.product
  const sellPrice = resolveSellPrice(item, p)
  const buyPrice = resolveBuyPrice(item, p)
  const opening = item.startQuantity ?? item.openingQuantity ?? 0
  const soldQty = item.sold ?? Math.max(opening - (item.currentQuantity ?? 0), 0)
  const revenue = item.revenue ?? soldQty * sellPrice
  const profit = item.realizedProfit ?? soldQty * (sellPrice - buyPrice)
  return { revenue, profit, qty: soldQty }
}

/** Inclusive list of 'YYYY-MM-DD' day keys between from/to. */
export function enumerateDays(from: string, to: string): string[] {
  const days: string[] = []
  let d = dayjs(from)
  const end = dayjs(to)
  if (!d.isValid() || !end.isValid()) return days
  let guard = 0
  while ((d.isBefore(end, 'day') || d.isSame(end, 'day')) && guard < MAX_DAYS) {
    days.push(d.format('YYYY-MM-DD'))
    d = d.add(1, 'day')
    guard++
  }
  return days
}

/** Inclusive list of 'YYYY-MM' month keys between from/to. */
export function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = []
  let d = dayjs(from).startOf('month')
  const end = dayjs(to).startOf('month')
  if (!d.isValid() || !end.isValid()) return months
  let guard = 0
  while ((d.isBefore(end, 'month') || d.isSame(end, 'month')) && guard < MAX_MONTHS) {
    months.push(d.format('YYYY-MM'))
    d = d.add(1, 'month')
    guard++
  }
  return months
}

/** Group items by their `date` field into one bucket per day in `days`. */
export function buildDayBuckets(items: any[], days: string[], currentKey: string): ChartBucket[] {
  const map = new Map<string, { revenue: number; profit: number; qty: number }>()
  for (const d of days) map.set(d, { revenue: 0, profit: 0, qty: 0 })
  for (const item of items ?? []) {
    const key = item?.date
    if (!key || !map.has(key)) continue
    const m = itemMetrics(item)
    const cur = map.get(key)!
    cur.revenue += m.revenue
    cur.profit += m.profit
    cur.qty += m.qty
  }
  return days.map((d) => {
    const v = map.get(d)!
    return {
      key: d,
      fullLabel: dayjs(d).format('DD MMM YYYY'),
      revenue: v.revenue,
      profit: v.profit,
      qty: v.qty,
      isCurrent: d === currentKey,
    }
  })
}

/** Group items by the month of their `date` field into one bucket per month in `months`. */
export function buildMonthBuckets(items: any[], months: string[], currentKey: string): ChartBucket[] {
  const map = new Map<string, { revenue: number; profit: number; qty: number }>()
  for (const m of months) map.set(m, { revenue: 0, profit: 0, qty: 0 })
  for (const item of items ?? []) {
    const key = typeof item?.date === 'string' ? item.date.slice(0, 7) : undefined
    if (!key || !map.has(key)) continue
    const m = itemMetrics(item)
    const cur = map.get(key)!
    cur.revenue += m.revenue
    cur.profit += m.profit
    cur.qty += m.qty
  }
  return months.map((mo) => {
    const v = map.get(mo)!
    return {
      key: mo,
      fullLabel: dayjs(`${mo}-01`).format('MMMM YYYY'),
      revenue: v.revenue,
      profit: v.profit,
      qty: v.qty,
      isCurrent: mo === currentKey,
    }
  })
}
