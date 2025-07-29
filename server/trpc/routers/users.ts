import { createTRPCRouter, adminProcedure } from '../init'
import { UserService } from '../../crud/users'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { createUserByAdminSchema, setUserAccessByAdminSchema } from '~~/schemas/users'

export const usersRouter = createTRPCRouter({
  // Admin procedures for user management
  getPendingUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const users = await UserService.getPendingUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  getRetiredUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const users = await UserService.getRetiredUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  getApprovedUsers: adminProcedure
    .query(async (): Promise<DisplayUserToAdmin[]> => {
      const users = await UserService.getApprovedUsers()
      return await Promise.all(users.map(user => UserService.convertToDisplayUserToAdmin(user)))
    }),

  createUserByAdmin: adminProcedure
    .input(createUserByAdminSchema)
    .mutation(async ({ input }) => {
      const newUser = await UserService.createUserByAdmin(input)
      if (newUser) {
        return await UserService.convertToDisplayUserToAdmin(newUser)
      }
      return null
    }),

  setUserAccessByAdmin: adminProcedure
    .input(setUserAccessByAdminSchema)
    .mutation(async ({ input }) => {
      const updatedUser = await UserService.setUserAccessByAdmin(input)
      if (updatedUser) {
        return await UserService.convertToDisplayUserToAdmin(updatedUser)
      }
      return null
    })
})
