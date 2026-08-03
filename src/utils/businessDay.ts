import dayjs from 'dayjs'
import { BUSINESS_DAY_START_HOUR as DEFAULT_HOUR } from '../constants'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

let activeHour = DEFAULT_HOUR
let pendingHour: number | null = null
let effectiveFrom: string | null = null

export const setBusinessDayStartHour = (hour: number) => {
  activeHour = hour
}

export const getBusinessDayStartHour = () => {
  applyPendingIfNeeded()
  return activeHour
}

export const scheduleBusinessDayStartHour = (hour: number) => {
  const tomorrow = dayjs().add(1, 'day').startOf('day').hour(hour)
  pendingHour = hour
  effectiveFrom = tomorrow.toISOString()
}

export const setPendingBusinessDayHour = (hour: number, from: string) => {
  pendingHour = hour
  effectiveFrom = from
}

export const getPendingBusinessDayStartHour = () => pendingHour
export const getEffectiveFrom = () => effectiveFrom

export const clearPending = () => {
  pendingHour = null
  effectiveFrom = null
}

function applyPendingIfNeeded() {
  if (pendingHour === null || effectiveFrom === null) return
  if (dayjs().isAfter(dayjs(effectiveFrom))) {
    activeHour = pendingHour
    pendingHour = null
    effectiveFrom = null
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
