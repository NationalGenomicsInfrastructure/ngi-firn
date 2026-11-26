/*
 * Unit tests for the client rules deciding which task actions to offer. They are a pure function
 * with no CouchDB dependency; they live here only because this is the configured Vitest include
 * path. The expectations mirror server/auth/taskPolicy.ts and TaskService.
 */
import { describe, it, expect } from 'vitest'
import { hasTaskActions, taskActions } from '~/utils/tasks/actions'
import type { DisplayTask } from '~~/types/productivity'

const noProgress: DisplayTask['progress'] = {
  total: 0,
  planned: 0,
  held: 0,
  executing: 0,
  completed: 0,
  skipped: 0,
  cancelled: 0,
  needsReconciliation: 0
}

function offered(overrides: Partial<DisplayTask> = {}) {
  const actions = taskActions({
    viewerRole: 'owner',
    status: 'open',
    visibility: 'public',
    responsibleUsers: [],
    archivedAt: null,
    progress: noProgress,
    ...overrides
  })
  const { closingBlocked: _blocked, ...flags } = actions
  return Object.entries(flags).filter(([, value]) => value).map(([name]) => name)
}

const someone = { firnId: 'AB123', name: 'Ada Example', avatar: null }

describe('taskActions', () => {
  it('offers the owner publishing only for a draft', () => {
    expect(offered({ status: 'draft' })).toEqual(['editPeople', 'publish', 'cancel', 'archive'])
    expect(offered({ status: 'open' })).toEqual(['editPeople', 'cancel', 'archive'])
  })

  it('does not offer to cancel a finished task', () => {
    expect(offered({ status: 'completed' })).toEqual(['editPeople', 'archive'])
    expect(offered({ status: 'cancelled' })).toEqual(['editPeople', 'archive'])
  })

  it('leaves only the people of an archived task editable', () => {
    expect(offered({ status: 'draft', archivedAt: '2026-01-01T00:00:00.000Z' })).toEqual(['editPeople'])
  })

  it('offers claiming an unassigned, open, public task to non-members and viewers', () => {
    expect(offered({ viewerRole: 'public' })).toEqual(['claim'])
    expect(offered({ viewerRole: 'viewer' })).toEqual(['claim'])
  })

  it.each([
    ['taken', { responsibleUsers: [someone] }],
    ['private', { visibility: 'private' as const }],
    ['a draft', { status: 'draft' as const }],
    ['archived', { archivedAt: '2026-01-01T00:00:00.000Z' }]
  ])('does not offer claiming a task that is %s', (_label, overrides) => {
    expect(offered({ viewerRole: 'viewer', ...overrides })).toEqual([])
  })

  it('offers releasing to a responsible user while the task is unfinished', () => {
    const member = { viewerRole: 'responsible' as const, responsibleUsers: [someone] }
    expect(offered(member)).toEqual(['release'])
    expect(offered({ ...member, status: 'completed' })).toEqual([])
  })

  it.each(['held', 'executing', 'needsReconciliation'] as const)('blocks closing while steps are %s', (state) => {
    const actions = taskActions({
      viewerRole: 'owner',
      status: 'open',
      visibility: 'private',
      responsibleUsers: [],
      archivedAt: null,
      progress: { ...noProgress, total: 1, [state]: 1 }
    })
    expect(actions.closingBlocked).toBe(true)
  })

  it('knows when there is nothing to offer', () => {
    const base = { status: 'open' as const, visibility: 'private' as const, responsibleUsers: [], archivedAt: null, progress: noProgress }
    expect(hasTaskActions(taskActions({ ...base, viewerRole: 'viewer' }))).toBe(false)
    expect(hasTaskActions(taskActions({ ...base, viewerRole: 'owner' }))).toBe(true)
  })
})
