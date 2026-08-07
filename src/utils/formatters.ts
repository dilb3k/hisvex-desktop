import dayjs from 'dayjs'

export const formatCurrency = (amount: number): string =>
  `${formatAmount(amount)} so'm`

// Canonical money formatter (used across screens as `formatMoney`).
// Guards against null/undefined/NaN/Infinity in addition to formatAmount's
// own number/string handling.
export const formatMoney = (value?: number): string => {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "0 so'm"
  return `${formatAmount(value)} so'm`
}

export const formatDate = (date: string): string =>
  dayjs(date).format('DD MMM YYYY')

export const formatDateTime = (date: string): string =>
  dayjs(date).format('DD MMM YYYY, HH:mm')

export const formatAmount = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (typeof num !== 'number' || Number.isNaN(num) || !Number.isFinite(num)) return '0'
  return num.toLocaleString('uz-UZ')
}

export const formatInputAmount = (value: string): string => {
  const cleaned = value.replace(/[^\d]/g, '')
  if (!cleaned) return ''
  const num = parseInt(cleaned, 10)
  if (isNaN(num)) return ''
  return num.toLocaleString('uz-UZ')
}

export const parseFormattedAmount = (value: string): number => {
  const cleaned = value.replace(/[^\d]/g, '')
  if (!cleaned) return 0
  return parseInt(cleaned, 10)
}

export const formatPhone = (text: string): string => {
  const digits = text.replace(/\D/g, '').slice(0, 12)
  if (digits.length === 0) return '+998'
  let r = '+' + digits.slice(0, 3)
  if (digits.length > 3) r += ' ' + digits.slice(3, 5)
  if (digits.length > 5) r += ' ' + digits.slice(5, 8)
  if (digits.length > 8) r += ' ' + digits.slice(8, 10)
  if (digits.length > 10) r += ' ' + digits.slice(10, 12)
  return r
}

// Re-formats an already-stored phone number (raw digits, no leading '+')
// back into the same "+998 XX XXX XX XX" display shape as formatPhone.
export const displayPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return phone
  return formatPhone(digits)
}

// Short dd.mm.yyyy date formatter — a canonical, timezone-safe counterpart to
// formatDate() above (which uses dayjs's "DD MMM YYYY" month-name style, a
// different convention from the numeric dd.mm.yyyy used elsewhere in the
// app, e.g. debtor cards/history). Mirrors hisvex-web's formatShortDate.
//
// Bare date-only strings ("YYYY-MM-DD") have no timezone info, so
// `new Date()` parses them as UTC midnight — reading that back with local
// getters shifts the date by a day in negative-UTC-offset timezones. Parse
// the Y/M/D components directly instead for that case.
export const formatShortDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (dateOnlyMatch && !dateStr.includes('T')) {
    const [, yyyy, mm, dd] = dateOnlyMatch
    return `${dd}.${mm}.${yyyy}`
  }
  // Full ISO timestamps represent a real moment in time — converting to
  // local time via the normal Date getters is correct here.
  const d = new Date(dateStr)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}
