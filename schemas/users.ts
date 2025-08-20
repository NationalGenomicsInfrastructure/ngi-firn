import { z } from 'zod'

// Input schemas

// Minimal user object for creating a user by an admin
export const createUserByAdminSchema = z.object({
  googleGivenName: z.string().min(1, { message: 'First name is required' }),
  googleFamilyName: z.string().min(1, { message: 'Last name is required' }),
  googleEmail: z.email().refine(
    val => val.endsWith('@scilifelab.se'),
    { message: 'Email must be a scilifelab.se address' }
  ),
  isAdmin: z.boolean()
})

// Input schema for approving requested access of user by an admin
export const setUserAccessByAdminSchema = z.object({
  googleId: z.number(),
  googleGivenName: z.string(),
  googleFamilyName: z.string(),
  allowLogin: z.boolean().default(true),
  isRetired: z.boolean().default(false),
  isAdmin: z.boolean().default(false)
})

// Input schema for deleting a user by an admin
export const deleteUserByAdminSchema = z.object({
  googleId: z.number()
})

// Inferred types from schemas
export type CreateUserByAdminInput = z.infer<typeof createUserByAdminSchema>
export type SetUserAccessByAdminInput = z.infer<typeof setUserAccessByAdminSchema>
export type DeleteUserByAdminInput = z.infer<typeof deleteUserByAdminSchema>