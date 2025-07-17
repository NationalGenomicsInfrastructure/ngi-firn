import { z } from 'zod'

// Input schemas

// Minimal user object for creating a user by an admin
export const createUserByAdminSchema = z.object({
    googleEmail: z.string().email().refine(
    (val) => val.endsWith('@scilifelab.se'),
    { message: 'Email must be a scilifelab.se address' }
    ),
    allowLogin: z.boolean().default(true),
    isRetired: z.boolean().default(false),
    isAdmin: z.boolean().default(false)
})

// Input schema for approving requested access of user by an admin
export const setUserAccessByAdminSchema = z.object({
    googleId: z.number(),
    allowLogin: z.boolean().default(true),
    isRetired: z.boolean().default(false),
    isAdmin: z.boolean().default(false)
})

// Inferred types from schemas
export type CreateUserByAdminInput = z.infer<typeof createUserByAdminSchema>
export type SetUserAccessByAdminInput = z.infer<typeof setUserAccessByAdminSchema>