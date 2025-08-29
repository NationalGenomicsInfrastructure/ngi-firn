import { createTRPCRouter, adminProcedure, baseProcedure, firnUserProcedure } from '../init'
import {UserService} from '../../crud/users'
import { tokenHandler } from '../../security/tokens'
import type { DisplayUserToAdmin, GoogleUserQuery, FirnUser } from '~~/types/auth'
import { generateFirnUserTokenSchema, deleteFirnUserTokenSchema, validateFirnUserTokenSchema, deleteUserTokenByAdminSchema } from '~~/schemas/tokens'
import { TRPCError } from '@trpc/server'

export const tokensRouter = createTRPCRouter({

  // firnUserProcedure instead of authedProcedure because we need the full user object in tRPC context
  generateFirnUserToken: firnUserProcedure
    .input(generateFirnUserTokenSchema)
    .mutation(async ({ input, ctx }): Promise<{jwt: string, user: DisplayUserToAdmin} | null> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const result = await tokenHandler.generateFirnUserToken(ctx.firnUser, input.audience, input.expiresAt.toISOString())
      if (result?.jwt && result?.user) {
        const updatedUser = await UserService.convertToDisplayUserToAdmin(result.user)
        return { jwt: result.jwt, user: updatedUser }
      }
      return null
    }),

  // firnUserProcedure instead of authedProcedure because we need the full user object in tRPC context
  deleteFirnUserToken: firnUserProcedure
    .input(deleteFirnUserTokenSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayUserToAdmin | null> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const deletedTokenUser = await tokenHandler.deleteFirnUserToken(ctx.firnUser, input.tokenID)
      if (deletedTokenUser) {
        return await UserService.convertToDisplayUserToAdmin(deletedTokenUser)
      }
      return null
    }),

  // ToDO
  validateFirnUserToken: baseProcedure
    .input(validateFirnUserTokenSchema)
    .mutation(async ({ input }): Promise<DisplayUserToAdmin | null> => {
      const updatedUser = await UserService.setUserAccessByAdmin(input)
      if (updatedUser) {
        return await UserService.convertToDisplayUserToAdmin(updatedUser)
      }
      return null
    }),

  deleteUserTokenByAdmin: adminProcedure
    .input(deleteUserTokenByAdminSchema)
    .mutation(async ({ input }): Promise<DisplayUserToAdmin | null> => {

      // construct the query object to retrieve the full user object
      const query: GoogleUserQuery = {
        provider: 'google',
        googleId: input.googleId,
        googleEmail: input.googleEmail
      }

      // get the full user object by Google ID and e-mail
      const firnUser = await UserService.matchGoogleUserByGoogleQuery(query)
      if (!firnUser) {
        return null
      }

      const deletedTokenUser = await tokenHandler.deleteFirnUserToken(firnUser, input.tokenID)
      
      if (deletedTokenUser) {
        return await UserService.convertToDisplayUserToAdmin(deletedTokenUser)
      }
      return null
}),

}) 
