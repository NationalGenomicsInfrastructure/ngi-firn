import type { BaseDocument } from '../server/database/couchdb'

// Define the User interface
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
  githubId?: number
  githubName?: string
  githubAvatar?: string
  githubEmail?: string
  githubUrl?: string
  // Timestamps
  createdAt: string
  lastSeenAt: string
  // User properties
  isAdmin: boolean
  permissions: string[]
  tokens: string[]
  sessions: string[]
  // User-related collections
  todos: string[]
  preferences: string[]
}

declare module '#auth-utils' {
  interface SessionUser extends FirnUser {
      provider: 'github' | 'google' | 'token' 
      currentSessionId: string
      currentSessionExpiresAt: string
  }

  interface GoogleUser extends Partial<SessionUser> {
    provider: 'google'
    googleId: number
    googleName: string
    googleGivenName: string
    googleFamilyName: string
    googleAvatar: string
    googleEmail: string
    googleEmailVerified: boolean
  }

  interface GitHubUser extends Partial<SessionUser> {
    provider: 'github'
    githubId: number
    githubName: string
    githubAvatar?: string
    githubEmail?: string
    githubUrl?: string
  }
  
}
