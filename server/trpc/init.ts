import { initTRPC, TRPCError } from '@trpc/server'
import type { H3Event } from 'h3'
import { UserService } from '../crud/users'
import type { SessionUser,SessionUserSecure, FirnUser } from '../../types/auth'

interface Context {
  user: SessionUser | null
  secure: SessionUserSecure | null
  firnUser?: FirnUser | null
}

// The context is only server-side, the client can't access it.
export const createTRPCContext = async (event: H3Event): Promise<Context> => {
  // Get the session from the event
  const session = await getUserSession(event)
  // Get the session user and secure user from the session
  const sessionUser = session?.user as SessionUser | null
  const sessionUserSecure = session?.secure as SessionUserSecure | null
  
  if (!sessionUser && !sessionUserSecure) {
    return {
      user: null,
      secure: null
    }
  } else {
    return {
      user: sessionUser,
      secure: sessionUserSecure
    }
  }
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
  // We use the private session user secure object for authorization
  if (!ctx.secure) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  
  // Check if the user is allowed to login
  if (!ctx.secure.allowLogin || ctx.secure.isRetired) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not allowed to login' })
  }

  // If the user is allowed to login, proceed without modifying the context
  return next()
})


// Middleware to check if user has admin permissions
const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.secure?.isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return next()
})


// Middleware to get the full user object from the database
const getFirnUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.secure) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  
  // Match the session user to the database user and return the full user object in context
  const firnUser = await UserService.matchSessionUserSecure(ctx.secure)

  if (!firnUser) {
    return next()
  } else {
    return next({
      ctx: {
        ...ctx,
        firnUser : firnUser
      }
    })
  }
})

// Export procedures
export const authedProcedure = baseProcedure.use(isAuthed)
export const adminProcedure = baseProcedure.use(isAdmin)
export const firnUserProcedure = baseProcedure.use(getFirnUser)