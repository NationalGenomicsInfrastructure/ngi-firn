import type { BaseDocument } from '../server/database/couchdb'

// Full user object as it is stored in the database
export interface FirnUser extends BaseDocument {
  type: 'user'
  schema: 1
  googleId: number
  googleName: string
  googleGivenName: string
  googleFamilyName: string
  googleAvatar: string | null
  googleEmail: string
  googleEmailVerified: boolean
  // GitHub-specific fields for linking
  githubId: number | null
  githubNodeId: string | null
  githubName: string | null
  githubAvatar: string | null
  githubEmail: string | null
  githubUrl: string | null
  // Timestamps
  createdAt: string
  lastSeenAt: string
  // User properties
  allowLogin: boolean
  isRetired: boolean
  isAdmin: boolean
  permissions: string[]
  tokens: string[]
  // User-related collections
  todos: string[]
  preferences: string[]
}

// Google OAuth user object
export interface GoogleUser extends Partial<FirnUser> {
  provider: 'google'
  googleId: number
  googleName: string
  googleGivenName: string
  googleFamilyName: string
  googleAvatar: string
  googleEmail: string
  googleEmailVerified: boolean
}

// GitHub OAuth user object
export interface GitHubUser extends Partial<FirnUser> {
  provider: 'github'
  githubId: number
  githubNodeId: string | null
  githubName: string | null
  githubAvatar: string | null
  githubEmail: string | null
  githubUrl: string
}

// User object as it is stored in the session cookie, no sensitive data
export interface SessionUser {
  provider: 'github' | 'google' | 'token'
  name: string
  givenName?: string
  familyName?: string
  avatar: string | null
  linkedGitHub: boolean
  // Purely informational fields for UI rendering, not to be used for authentication!
  allowLoginClientside: boolean
  isRetiredClientside: boolean
  isAdminClientside: boolean
}

// Private user object, only available on server side
export interface SessionUserSecure {
  id: string
  rev?: string
  allowLogin: boolean
  isRetired: boolean
  isAdmin: boolean
  permissions: string[]
}

// Display user object, used for displaying user information about other users to an admin
export interface DisplayUserToAdmin {
  googleId?: number
  googleName?: string
  googleGivenName?: string
  googleFamilyName?: string
  googleAvatar: string | null
  googleEmail: string
  githubId: number | null
  githubAvatar: string | null
  githubUrl: string | null
  createdAt?: string
  lastSeenAt?: string
  allowLogin: boolean
  isRetired: boolean
  isAdmin: boolean
  permissions: string[]
  tokens: string[]
}

// Auth status object to render toast notifications in the UI, amended to the UserSession interface
export interface AuthStatus {
  kind: 'base' | 'success' | 'warning' | 'error'
  reject: boolean
  title: string
  message: string
}

// Extend the auth-utils module type declarations to include our custom fields
declare module '#auth-utils' {
  type User = SessionUser
  type SecureSessionData = SessionUserSecure
  interface UserSession extends UserSession {
    authStatus?: AuthStatus
  }
}
