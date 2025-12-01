import { initTRPC, TRPCError } from '@trpc/server'
import type { H3Event } from 'h3'
import type { SessionUser, SessionUserSecure, FirnUser } from '../../types/auth'
import type { Context } from '../../types/trpc'

// The tRPC context is only server-side, the client can't access it.
// It is therefore safe to put the private parts of the session in the context.
export const createTRPCContext = async (event: H3Event): Promise<Context> => {
  // Get the session from the event
  const session = await getUserSession(event)
  // Get the session user and secure user from the session
  const sessionUser = session?.user as SessionUser
  const sessionUserSecure = session?.secure as SessionUserSecure

  // Sessions are the primary way to authenticate a user, but we also support token authentication
  if (!sessionUser && !sessionUserSecure) {
    // dynamic import to avoid bundling heavy crypto libraries into client
    const { tokenHandler } = await import('../security/tokens.server')

    // No existing session, let's try to extract an authorization token from the request
    const token = await tokenHandler.extractTokenFromHeader(event)
    if (token && token.length > 0) {
      // in the baseProcedure, we just add a transmitted authorization token to the context.
      // Otherwise, each tRPC request would trigger a database query to verify the token.
      // The verification is done in the tokenAuth middleware only, so we can allow token authentication
      // for specific tRPC procedures only.
      return {
        token: token
      } as Context
    }
    else {
      return {} as Context
    }
  }
  else {
    return {
      user: sessionUser,
      secure: sessionUserSecure
    } as Context
  }
}

// Avoid exporting the entire t-object since it's not very descriptive.
// For instance, the use of a t variable is common in i18n libraries.
const t = initTRPC.context<Context>().create({
  /*
  * see: https://trpc.io/docs/server/data-transformers
  */
  // transformer: superjson,
})

// Export base router and procedure helpers
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const baseProcedure = t.procedure

/*
  * Middleware
  */

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

  const { UserService } = await import('../crud/users.server')

  // Match the session user to the database user and return the full user object in context
  const firnUser = await UserService.matchSessionUserSecure(ctx.secure)

  if (!firnUser) {
    return next()
  }
  else {
    return next({
      ctx: {
        ...ctx,
        firnUser: firnUser as FirnUser
      }
    })
  }
})

// Middleware to authenticate a user with a token
const hasValidToken = t.middleware(async ({ ctx, next }) => {
  if (!ctx.token) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authorization header required' })
  }

  // dynamic import to avoid bundling heavy crypto libraries into client
  const { UserService } = await import('../crud/users.server')
  const { tokenHandler } = await import('../security/tokens.server')

  // verify that it is a valid user token (aka general auth token)
  const result = await tokenHandler.verifyFirnUserToken(ctx.token, 'user')

  if (result.error) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: result.error })
  }

  if (result.user) {
    // convert the user object to a session user object
    const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(result.user as FirnUser, 'token')

    if (!sessionUserSecure.allowLogin) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your user account has been suspended and is not allowed to login' })
    }

    if (sessionUserSecure.isRetired) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your user account has been retired' })
    }

    return next({
      // drop the token from the context, switch to session authentication
      ctx: {
        user: sessionUser,
        secure: sessionUserSecure
      }
    })
  }
  else {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' })
  }
})

// Export procedures with middleware
export const authedProcedure = baseProcedure.use(isAuthed) // For endpoints that require authentication
export const adminProcedure = baseProcedure.use(isAdmin) // For endpoints that require admin permissions
export const firnUserProcedure = baseProcedure.use(getFirnUser) // For endpoints that need the full user object from the database
export const tokenProcedure = baseProcedure.use(hasValidToken) // For endpoints that allow token authentication
