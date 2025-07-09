import { initTRPC, TRPCError } from '@trpc/server'
import type { H3Event } from 'h3'
import { UserService } from '../crud/users'

interface Context {
  auth?: {
    user?: {
      id: string
      name: string
      email?: string
    }
  }
}

export const createTRPCContext = async (event: H3Event): Promise<Context> => {
  /**
  * see: https://trpc.io/docs/server/context
  */
  return { auth: event.context.auth }
}

// Avoid exporting the entire t-object since it's not very descriptive.
// For instance, the use of a t variable is common in i18n libraries.
const t = initTRPC.context<Context>().create({
  /**
  * see: https://trpc.io/docs/server/data-transformers
  */
  // transformer: superjson,
})

// Export base router and procedure helpers
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const baseProcedure = t.procedure

// Middleware to check if user is authenticated
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.auth?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.auth.user
    }
  })
})

// Middleware to check if user is approved (for Firn)
const isApproved = t.middleware(async ({ ctx, next }) => {
  if (!ctx.auth?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  
  const isApproved = await UserService.isUserApproved(ctx.auth.user.id)
  if (!isApproved) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User not approved' })
  }
  
  return next({
    ctx: {
      ...ctx,
      user: ctx.auth.user
    }
  })
})

// Middleware to check if user is admin
const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.auth?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  
  const isAdmin = await UserService.isUserAdmin(ctx.auth.user.id)
  if (!isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  
  return next({
    ctx: {
      ...ctx,
      user: ctx.auth.user
    }
  })
})

// Export procedures
export const authedProcedure = baseProcedure.use(isAuthed)
export const approvedProcedure = baseProcedure.use(isApproved)
export const adminProcedure = baseProcedure.use(isAdmin)
