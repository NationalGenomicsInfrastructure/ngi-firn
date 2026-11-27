/*
 * Unit tests for the state rules of the task policy and the actions it offers. They are pure
 * functions with no CouchDB dependency; they live here only because this is the configured Vitest
 * include path. Testing them directly also covers completed tasks, which no service can currently
 * produce.
 */
import { describe, it, expect } from 'vitest'
import {
  assertCanReleaseResponsibility,
  assertTaskCanBeCancelled,
  assertTaskCanBePublished,
  taskActionsFor
} from '../../server/auth/taskPolicy'
import { ForbiddenError } from '../../server/auth/errors'
import type { FirnUser } from '../../types/auth'
import type { TaskActivationDocument, TaskActivationState, TaskDocument, TaskStatus } from '../../types/productivity'

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

describe('taskActionsFor', () => {
  const person = (name: string) => ({ _id: `user:${name}`, allowLogin: true, isRetired: false }) as FirnUser
  const ref = (user: FirnUser) => ({ db: 'firn' as const, id: user._id, type: 'firnUser' as const })
  const owner = person('owner')
  const responsible = person('responsible')
  const viewer = person('viewer')
  const outsider = person('outsider')

  function shared(overrides: Partial<TaskDocument> = {}) {
    return {
      status: 'open',
      visibility: 'private',
      archivedAt: null,
      managingOwner: { kind: 'user', user: ref(owner) },
      responsibleUsers: [ref(responsible)],
      viewers: [ref(viewer)],
      ...overrides
    } as TaskDocument
  }

  function activation(state: TaskActivationState, executor: FirnUser) {
    return { state, executor: ref(executor) } as Pick<TaskActivationDocument, 'state' | 'executor'>
  }

  const offered = (task: TaskDocument, actor: FirnUser) => Object.keys(taskActionsFor(task, actor, [])).sort()

  it('offers the owner of a draft everything but claiming and releasing', () => {
    expect(offered(shared({ status: 'draft' }), owner)).toEqual(['archive', 'cancel', 'publish', 'setSharing'])
  })

  it.each(['completed', 'cancelled'] as const)('offers the owner of a %s task no cancelling', (status) => {
    expect(offered(shared({ status }), owner)).toEqual(['archive', 'setSharing'])
  })

  it('leaves the owner of an archived task only the sharing', () => {
    expect(offered(shared({ status: 'draft', archivedAt: ARCHIVED }), owner)).toEqual(['setSharing'])
  })

  it('offers a responsible user releasing, and a viewer of a private task nothing', () => {
    expect(offered(shared(), responsible)).toEqual(['releaseResponsibility'])
    expect(offered(shared(), viewer)).toEqual([])
  })

  it('offers nothing to someone who cannot read the task', () => {
    expect(offered(shared(), outsider)).toEqual([])
    expect(offered(shared({ visibility: 'public' }), { ...outsider, isRetired: true })).toEqual([])
  })

  it('offers claiming only while an open public task has nobody responsible', () => {
    const unclaimed = shared({ visibility: 'public', responsibleUsers: [] })
    expect(offered(unclaimed, viewer)).toEqual(['claim'])
    expect(offered(unclaimed, outsider)).toEqual(['claim'])
    expect(offered(shared({ visibility: 'public' }), outsider)).toEqual([])
    expect(offered({ ...unclaimed, status: 'draft' }, outsider)).toEqual([])
  })

  it.each(['active', 'needs_reconciliation'] as const)('blocks closing while an activation is %s', (state) => {
    const actions = taskActionsFor(shared(), owner, [activation(state, owner)])

    expect(actions.cancel?.blockedReason).toMatch(/in progress/i)
    expect(actions.archive?.blockedReason).toMatch(/in progress/i)
    expect(actions.setSharing?.blockedReason).toBeNull()
  })

  it.each(['finished', 'cancelled'] as const)('does not block closing after a %s activation', (state) => {
    expect(taskActionsFor(shared(), owner, [activation(state, owner)]).cancel?.blockedReason).toBeNull()
  })

  it('blocks releasing only for the executor of live work', () => {
    const own = taskActionsFor(shared(), responsible, [activation('active', responsible)])
    const ownersWork = taskActionsFor(shared(), responsible, [activation('active', owner)])

    expect(own.releaseResponsibility?.blockedReason).toMatch(/hand the activation over/i)
    expect(ownersWork.releaseResponsibility?.blockedReason).toBeNull()
  })
})
