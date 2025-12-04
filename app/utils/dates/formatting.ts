import { DateTime } from 'luxon'

interface DateFormatOptions {
  relative?: boolean
  includeWeekday?: boolean
  time?: boolean
}

export type ExpirationStatus = 'expired' | 'expiring-soon' | 'valid'

export function formatDate(
  date: string | Date | undefined,
  options: DateFormatOptions = {}
): string {
  const { relative = false, includeWeekday = false, time = false } = options

  if (!date) {
    return 'N/A'
  }

  // Convert to DateTime object
  const dateTime = typeof date === 'string'
    ? DateTime.fromISO(date)
    : DateTime.fromJSDate(date)

  if (!dateTime.isValid) {
    return 'Invalid date'
  }

  // Set to current timezone
  const localDateTime = dateTime.setZone(DateTime.local().zoneName)

  if (relative) {
    return localDateTime.toRelativeCalendar() || 'Invalid date'
  }

  if (!time) {
    if (includeWeekday) {
      return localDateTime.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)
    }
    return localDateTime.toLocaleString(DateTime.DATE_MED)
  }
  else {
    if (includeWeekday) {
      return localDateTime.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY)
    }
    return localDateTime.toLocaleString(DateTime.DATETIME_MED)
  }
}

/**
 * Calculate the expiration status of a date.
 * @param expiresAt - The expiration date as an ISO string or Date object
 * @param soonThresholdDays - Number of days before expiration to consider "expiring soon" (default: 7)
 * @returns The expiration status: 'expired', 'expiring-soon', or 'valid'
 */
export function getExpirationStatus(
  expiresAt: string | Date | undefined,
  soonThresholdDays: number = 7
): ExpirationStatus {
  if (!expiresAt) {
    return 'valid'
  }

  const expiryDate = typeof expiresAt === 'string'
    ? DateTime.fromISO(expiresAt)
    : DateTime.fromJSDate(expiresAt)

  if (!expiryDate.isValid) {
    return 'valid'
  }

  const daysUntilExpiry = expiryDate.diff(DateTime.now(), 'days').days

  if (daysUntilExpiry < 0) {
    return 'expired'
  }

  if (daysUntilExpiry <= soonThresholdDays) {
    return 'expiring-soon'
  }

  return 'valid'
}
