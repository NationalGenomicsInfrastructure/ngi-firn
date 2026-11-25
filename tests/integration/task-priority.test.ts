/*
 * Unit tests for the task priority rules (importance x computed urgency). No database.
 * "Now" is a Wednesday, so the 3-working-day horizon ends on Monday and skips the weekend.
 */
import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

import { computeQuadrant, computeUrgency, TASK_AGING_DAYS } from '../../server/crud/tasks/common'

const now = DateTime.fromISO('2026-11-25T10:00:00', { zone: 'Europe/Stockholm' })
const touched = '2026-11-25T08:00:00.000Z'

function urgency(dueDate: string | null, importance: 'important' | 'ordinary' = 'ordinary', updatedAt = touched) {
  return computeUrgency({ dueDate, importance, updatedAt }, now)
}

describe('computeUrgency', () => {
  it('treats overdue and due-today tasks as urgent by deadline', () => {
    expect(urgency('2026-11-20')).toEqual({ urgency: 'urgent', reason: 'deadline' })
    expect(urgency('2026-11-25')).toEqual({ urgency: 'urgent', reason: 'deadline' })
  })

  it('reaches three working days ahead, skipping the weekend', () => {
    expect(urgency('2026-11-30').urgency).toBe('urgent') // Monday = Wed + 3 working days
    expect(urgency('2026-12-01').urgency).toBe('not_urgent')
  })

  it('keeps ordinary undated tasks not urgent however old they are', () => {
    expect(urgency(null, 'ordinary', '2020-01-01T00:00:00.000Z')).toEqual({ urgency: 'not_urgent', reason: null })
  })

  it('promotes an undated important task once it has aged', () => {
    const aged = now.minus({ days: TASK_AGING_DAYS }).toISO()!
    const fresh = now.minus({ days: TASK_AGING_DAYS - 1 }).toISO()!
    expect(urgency(null, 'important', aged)).toEqual({ urgency: 'urgent', reason: 'aged' })
    expect(urgency(null, 'important', fresh).urgency).toBe('not_urgent')
  })

  it('lets a far-off deadline override aging', () => {
    const aged = now.minus({ days: 100 }).toISO()!
    expect(urgency('2027-03-01', 'important', aged).urgency).toBe('not_urgent')
  })
})

describe('computeQuadrant', () => {
  it('combines importance and urgency', () => {
    expect(computeQuadrant('important', 'urgent')).toBe('important_urgent')
    expect(computeQuadrant('important', 'not_urgent')).toBe('important_not_urgent')
    expect(computeQuadrant('ordinary', 'urgent')).toBe('ordinary_urgent')
    expect(computeQuadrant('ordinary', 'not_urgent')).toBe('ordinary_not_urgent')
  })
})
