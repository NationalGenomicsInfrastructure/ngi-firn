import type { DisplayUserToUsers } from '~~/types/auth'

/* Best human-readable name for a user: Google name, then given + family name, then e-mail. */
export function displayUserName(user: DisplayUserToUsers): string {
  if (user.googleName?.trim()) return user.googleName
  const combined = [user.googleGivenName?.trim(), user.googleFamilyName?.trim()].filter(Boolean).join(' ')
  return combined || user.googleEmail
}
