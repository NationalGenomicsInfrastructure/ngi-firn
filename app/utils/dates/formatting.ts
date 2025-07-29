import { DateTime } from 'luxon'

interface DateFormatOptions {
  relative?: boolean
  includeWeekday?: boolean
  time?: boolean
}

export function formatDate(
  date: string | Date,
  options: DateFormatOptions = {}
): string {
  const { relative = false, includeWeekday = false, time = false } = options

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
