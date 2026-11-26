/*
 * Unit tests for the state guards of the task policy. They are pure functions with no CouchDB
 * dependency; they live here only because this is the configured Vitest include path. Testing them
 * directly also covers completed tasks, which no service can currently produce.
 */
import { describe, it, expect } from 'vitest'
import {
  assertCanReleaseResponsibility,
  assertTaskCanBeCancelled,
  assertTaskCanBePublished
} from '../../server/auth/taskPolicy'
import { ForbiddenError } from '../../server/auth/errors'
import type { FirnUser } from '../../types/auth'
import type { TaskDocument, TaskStatus } from '../../types/productivity'

const member = { _id: 'user:member' } as FirnUser
const ARCHIVED = '2026-01-01T00:00:00.000Z'

function task(status: TaskStatus, archivedAt: string | null = null) {
  return {
    status,
    archivedAt,
    responsibleUsers: [{ db: 'firn', id: member._id, type: 'firnUser' }]
  } as unknown as TaskDocument
}

describe('assertTaskCanBePublished', () => {
  it('allows a draft', () => {
    expect(() => assertTaskCanBePublished(task('draft'))).not.toThrow()
  })

  it.each(['open', 'completed', 'cancelled'] as const)('refuses a task that is %s', (status) => {
    expect(() => assertTaskCanBePublished(task(status))).toThrow(ForbiddenError)
  })

  it('refuses an archived draft', () => {
    expect(() => assertTaskCanBePublished(task('draft', ARCHIVED))).toThrow(/archived/i)
  })
})

describe('assertTaskCanBeCancelled', () => {
  it.each(['draft', 'open'] as const)('allows a task that is %s', (status) => {
    expect(() => assertTaskCanBeCancelled(task(status))).not.toThrow()
  })

  it.each(['completed', 'cancelled'] as const)('refuses a task that is %s', (status) => {
    expect(() => assertTaskCanBeCancelled(task(status))).toThrow(ForbiddenError)
  })

  it('refuses an archived task', () => {
    expect(() => assertTaskCanBeCancelled(task('open', ARCHIVED))).toThrow(/archived/i)
  })
})

describe('assertCanReleaseResponsibility', () => {
  it.each(['draft', 'open'] as const)('allows a responsible user while the task is %s', (status) => {
    expect(() => assertCanReleaseResponsibility(task(status), member)).not.toThrow()
  })

  it.each(['completed', 'cancelled'] as const)('refuses once the task is %s', (status) => {
    expect(() => assertCanReleaseResponsibility(task(status), member)).toThrow(ForbiddenError)
  })

  it('refuses on an archived task', () => {
    expect(() => assertCanReleaseResponsibility(task('open', ARCHIVED), member)).toThrow(ForbiddenError)
  })

  it('refuses someone who is not responsible', () => {
    const stranger = { _id: 'user:stranger' } as FirnUser
    expect(() => assertCanReleaseResponsibility(task('open'), stranger)).toThrow(/not responsible/i)
  })
})
