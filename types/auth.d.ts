import type { BaseDocument } from '../server/database/couchdb'

// Full user object as it is stored in the database
export interface FirnUser extends BaseDocument {
  type: 'user'
  googleId: number
  googleName: string
  googleGivenName: string
  googleFamilyName: string
  googleAvatar: string
  googleEmail: string
  googleEmailVerified: boolean
  // GitHub-specific fields for linking
  githubId: number | null
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
githubName: string | null
githubAvatar: string | null
githubEmail: string | null
githubUrl: string
}

// User object as it is stored in the session, no sensitive data
export interface SessionUser {
  provider: 'github' | 'google' | 'token' 
  name: string
  givenName?: string
  familyName?: string
  avatar: string | null
  linkedGitHub: boolean
}

// Private user object, only server side
export interface SessionUserSecure {
  id: string
  rev?: string
  allowLogin: boolean
  isRetired: boolean
  isAdmin: boolean
  permissions: string[]
}

// Extend the auth-utils session to include our own fields
declare module '#auth-utils' {
  interface User extends SessionUser {}
  interface SecureSessionData extends SessionUserSecure {}
}