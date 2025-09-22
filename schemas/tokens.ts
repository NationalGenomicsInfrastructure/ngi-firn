import { DateTime } from 'luxon'
import { z } from 'zod'

// Input schema for creating an own token
export const generateFirnUserTokenSchema = z.object({
  expiresAt: z.string().refine(s => /^(\d{4}-\d{2}-\d{2})$/.test(s), {
    message: 'must be in the format yyyy-mm-dd'
  }).refine(s => DateTime.fromFormat(s, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days >= 1 && DateTime.fromFormat(s, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days <= 365, {
    message: 'must be between 1 and 365 days from now'
  }).transform(s => DateTime.fromFormat(s, 'yyyy-MM-dd').toISO() || DateTime.now().plus({ days: 7 }).toISO()),
  period: z.array(z.number()).min(1).max(365).optional(),  // not required by the API, but improves the user experience and is required for the form validation to pass.
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
