import { DateTime } from 'luxon'
import { z } from 'zod'

// Input schema for creating an own token
export const generateFirnUserTokenSchema = z.object({
  expiresAt: z.string().refine((s) => /^(\d{4}-\d{2}-\d{2})$/.test(s), {
    message: "Date must be in the format yyyy-mm-dd",
  }).transform((s) => DateTime.fromFormat(s, 'yyyy-mm-dd').toISO()),
  audience: z.string().optional()
})

// Input schema for deleting an own token
export const deleteFirnUserTokenSchema = z.object({
  tokenID: z.string()
})

// Input schema for validating a token
export const validateFirnUserTokenSchema = z.object({
  tokenString: z.string(),
  expectedAudience: z.string().optional()
})

// Input schema for deleting a token by an admin
export const deleteUserTokenByAdminSchema = z.object({
  googleId: z.number(),
  googleEmail: z.string(),
  tokenID: z.string()
})

// Inferred types from schemas
export type GenerateFirnUserTokenInput = z.infer<typeof generateFirnUserTokenSchema>
export type DeleteFirnUserTokenInput = z.infer<typeof deleteFirnUserTokenSchema>
export type ValidateFirnUserTokenInput = z.infer<typeof validateFirnUserTokenSchema>
export type DeleteUserTokenByAdminInput = z.infer<typeof deleteUserTokenByAdminSchema>
