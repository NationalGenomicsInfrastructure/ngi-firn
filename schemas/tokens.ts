import { DateTime } from 'luxon'
import { z } from 'zod'

// Input schema for creating an own token
// Diff >= 0 instead of 1, because 1 would require 24h of difference, but "tomorrow" is likely to be less than 24h away during regular business hours.
// The check is anyway mainly intended to prevent the user from choosing a date in the past.
export const generateFirnUserTokenSchema = z.object({
  expiresAt: z.string().refine(s => /^(\d{4}-\d{2}-\d{2})$/.test(s), {
    message: 'must be in the format yyyy-mm-dd'
  }).refine(s => DateTime.fromFormat(s, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days >= 0 && DateTime.fromFormat(s, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days <= 365, {
    message: 'must be between 1 and 365 days from now'
  }),
  period: z.array(z.number()).min(1).max(365).optional(), // not required by the API, but improves the user experience and is required for the form validation to pass.
  audience: z.string().optional(),
  tokenType: z.enum(['barcode', 'qrcode'])
})

// Input schema for deleting an own token
export const deleteFirnUserTokenSchema = z.object({
  tokenID: z.array(z.string())
})

// Input schema for validating a token
export const validateFirnUserTokenSchema = z.object({
  tokenString: z.string({ error: 'No token was provided!' }).min(1, { message: 'No token was provided!' }),
  expectedAudience: z.string().optional()
})

// Input schema for deleting a token by an admin
export const deleteUserTokenByAdminSchema = z.object({
  googleId: z.number(),
  googleEmail: z.string(),
  tokenID: z.array(z.string())
})

// Inferred types from schemas
export type GenerateFirnUserTokenInput = z.infer<typeof generateFirnUserTokenSchema>
export type DeleteFirnUserTokenInput = z.infer<typeof deleteFirnUserTokenSchema>
export type ValidateFirnUserTokenInput = z.infer<typeof validateFirnUserTokenSchema>
export type DeleteUserTokenByAdminInput = z.infer<typeof deleteUserTokenByAdminSchema>
