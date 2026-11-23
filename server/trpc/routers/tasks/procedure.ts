/*
 * Task procedure - the base procedure of every task endpoint.
 *
 * Requires an authenticated session with a matching Firn user (narrowing `ctx.firnUser` to a
 * FirnUser, so procedures need no per-call null check) and maps the task domain errors to tRPC
 * codes in this single place, as server/auth/errors.ts intends. Errors are matched by their `name`
 * (every domain error class sets it), so this module needs no static import of the crud services,
 * which the routers only load lazily.
 *
 * Every other error passes through unchanged (an INTERNAL_SERVER_ERROR).
 */
import { TRPCError } from '@trpc/server'
import { baseProcedure, createMiddleware, getFirnUser, isAuthed } from '../../init'

const TASK_ERROR_CODES: Record<string, TRPCError['code']> = {
  TaskNotFoundError: 'NOT_FOUND',
  // Not being allowed to see a task at all looks like it does not exist: never reveal private tasks.
  AuthorizationError: 'NOT_FOUND',
  ForbiddenError: 'FORBIDDEN',
  TaskValidationError: 'BAD_REQUEST',
  TaskConflictError: 'CONFLICT',
  ReservationConflictError: 'CONFLICT'
}

/* The tRPC code for a task domain error, or null when the error is not one of them. */
export function taskErrorCode(error: unknown): TRPCError['code'] | null {
  return error instanceof Error ? TASK_ERROR_CODES[error.name] ?? null : null
}

const requireFirnUser = createMiddleware(async ({ ctx, next }) => {
  if (!ctx.firnUser) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your user account could not be found.' })
  }
  return next({ ctx: { ...ctx, firnUser: ctx.firnUser } })
})

const mapTaskErrors = createMiddleware(async ({ next }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    const code = taskErrorCode(cause)
    if (code && cause) throw new TRPCError({ code, message: cause.message, cause })
  }
  return result
})

export const taskProcedure = baseProcedure
  .use(isAuthed)
  .use(getFirnUser)
  .use(requireFirnUser)
  .use(mapTaskErrors)
