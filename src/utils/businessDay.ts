import dayjs from 'dayjs'
import { BUSINESS_DAY_START_HOUR as DEFAULT_HOUR } from '../constants'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

let activeHour = DEFAULT_HOUR
let pendingHour: number | null = null
let effectiveFrom: string | null = null

const LS_HOUR = 'hisvex_business_hour'
const LS_PENDING_HOUR = 'hisvex_pending_hour'
const LS_PENDING_FROM = 'hisvex_pending_from'

export function initBusinessDay() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LS_HOUR)
      if (saved) activeHour = parseInt(saved, 10)
      const pending = localStorage.getItem(LS_PENDING_HOUR)
      const from = localStorage.getItem(LS_PENDING_FROM)
      if (pending && from) {
        pendingHour = parseInt(pending, 10)
        effectiveFrom = from
      }
    } catch {}
  }
}

export const setBusinessDayStartHour = (hour: number) => {
  activeHour = hour
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(LS_HOUR, String(hour)) } catch {}
  }
}

export const getBusinessDayStartHour = () => {
  applyPendingIfNeeded()
  return activeHour
}

export const scheduleBusinessDayStartHour = (hour: number) => {
  const tomorrow = dayjs().add(1, 'day').startOf('day').hour(hour)
  pendingHour = hour
  effectiveFrom = tomorrow.toISOString()
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_PENDING_HOUR, String(hour))
      localStorage.setItem(LS_PENDING_FROM, effectiveFrom)
    } catch {}
  }
}

export const setPendingBusinessDayHour = (hour: number, from: string) => {
  pendingHour = hour
  effectiveFrom = from
  // Persist like scheduleBusinessDayStartHour does — without this a
  // server-provided pending change was forgotten on the next app start.
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_PENDING_HOUR, String(hour))
      localStorage.setItem(LS_PENDING_FROM, from)
    } catch {}
  }
}

/**
 * Applies the server's authoritative business-day state — active hour plus any
 * scheduled change — in one step.
 *
 * The client used to schedule its own pending change from `dayjs().add(1,'day')`
 * (the machine's local timezone) while the backend scheduled its own from
 * TIMEZONE_OFFSET, so the two flipped at different instants and briefly
 * disagreed about which business day a sale belonged to. On top of that, every
 * /auth/me response called setBusinessDayStartHour(user.businessDayStartHour),
 * which overwrote a pending change the client had already correctly promoted
 * locally. The backend owns all three values; this mirrors them verbatim.
 */
export const syncBusinessDayFromServer = (input: {
  businessDayStartHour?: number | null
  pendingBusinessDayStartHour?: number | null
  businessDayEffectiveFrom?: string | null
}) => {
  if (typeof input.businessDayStartHour === 'number') {
    setBusinessDayStartHour(input.businessDayStartHour)
  }
  if (typeof input.pendingBusinessDayStartHour === 'number' && input.businessDayEffectiveFrom) {
    setPendingBusinessDayHour(input.pendingBusinessDayStartHour, input.businessDayEffectiveFrom)
  } else {
    clearPending()
  }
}

export const getPendingBusinessDayStartHour = () => pendingHour
export const getEffectiveFrom = () => effectiveFrom

export const clearPending = () => {
  pendingHour = null
  effectiveFrom = null
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LS_PENDING_HOUR)
      localStorage.removeItem(LS_PENDING_FROM)
    } catch {}
  }
}

function applyPendingIfNeeded() {
  if (pendingHour === null || effectiveFrom === null) return
  if (dayjs().isAfter(dayjs(effectiveFrom))) {
    activeHour = pendingHour
    pendingHour = null
    effectiveFrom = null
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_HOUR, String(activeHour))
        localStorage.removeItem(LS_PENDING_HOUR)
        localStorage.removeItem(LS_PENDING_FROM)
      } catch {}
    }
  }
}

export const getBusinessDate = (input?: string | Date | dayjs.Dayjs): string => {
  if (typeof input === 'string' && DATE_ONLY_PATTERN.test(input)) {
    return input
  }
  applyPendingIfNeeded()
  const value = input ? dayjs(input) : dayjs()
  const adjusted = value.hour() < activeHour ? value.subtract(1, 'day') : value
  return adjusted.format('YYYY-MM-DD')
}

export const getBusinessDayMoment = (date?: string) =>
  dayjs(date || getBusinessDate(), 'YYYY-MM-DD')

export const isPastBusinessDate = (date: string): boolean =>
  getBusinessDayMoment(date).isBefore(getBusinessDayMoment(), 'day')

export const isTodayBusinessDate = (date: string): boolean =>
  getBusinessDayMoment(date).isSame(getBusinessDayMoment(), 'day')

export const isFutureBusinessDate = (date: string): boolean =>
  getBusinessDayMoment(date).isAfter(getBusinessDayMoment(), 'day')
