import { createTRPCRouter, adminProcedure, firnUserProcedure } from '../init'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { createUserByAdminSchema, deleteUserByAdminSchema, setUserAccessByAdminSchema } from '~~/schemas/users'
import { TRPCError } from '@trpc/server'

export const usersRouter = createTRPCRouter({

  getUserInfoSelf: firnUserProcedure
    .query(async ({ ctx }): Promise<DisplayUserToAdmin> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const { UserService } = await import('../../crud/users.server')
      const user = await UserService.convertToDisplayUserToAdmin(ctx.firnUser)
      return user
    }),

  // Admin procedures for user management

  getPendingUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const { UserService } = await import('../../crud/users.server')
      const users = await UserService.getPendingUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  getRetiredUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const { UserService } = await import('../../crud/users.server')
      const users = await UserService.getRetiredUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  getApprovedUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const { UserService } = await import('../../crud/users.server')
      const users = await UserService.getApprovedUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  createUserByAdmin: adminProcedure
    .input(createUserByAdminSchema)
    .mutation(async ({ input }): Promise<DisplayUserToAdmin | null> => {
      const { UserService } = await import('../../crud/users.server')
      const newUser = await UserService.createUserByAdmin(input)
      if (newUser) {
        return await UserService.convertToDisplayUserToAdmin(newUser)
      }
      return null
    }),

  deleteUserByAdmin: adminProcedure
    .input(deleteUserByAdminSchema)
    .mutation(async ({ input }): Promise<DisplayUserToAdmin | null> => {
      const { UserService } = await import('../../crud/users.server')
      const deletedUser = await UserService.deleteUserByAdmin(input)
      if (deletedUser) {
        return await UserService.convertToDisplayUserToAdmin(deletedUser)
      }
      return null
    }),

  setUserAccessByAdmin: adminProcedure
    .input(setUserAccessByAdminSchema)
    .mutation(async ({ input }): Promise<DisplayUserToAdmin | null> => {
      const { UserService } = await import('../../crud/users.server')
      const updatedUser = await UserService.setUserAccessByAdmin(input)
      if (updatedUser) {
        return await UserService.convertToDisplayUserToAdmin(updatedUser)
      }
      return null
    })
})
