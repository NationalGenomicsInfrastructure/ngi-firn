import type { BaseDocument } from '../server/database/couchdb'

declare module '#auth-utils' {
  interface User extends BaseDocument {
    type: 'user'
    provider: 'github' | 'google' | 'token' | 'anonymous'
    name: string
    avatar: string
    email: string
    emailVerified: boolean
    createdAt: string
    updatedAt: string
    lastSeen: string
    isAdmin: boolean
    permissions: string[]
    tokens: string[]
    sessions: string[]
    todos: string[]
    settings: Record<string, string>
    preferences: Record<string, string>
    // Provider-specific IDs
    googleId?: string
    githubId?: string
    // GitHub-specific fields for linking
    githubName?: string
    githubAvatar?: string
    githubUrl?: string
  }
}

// Export the User type for use in other modules
export interface User extends BaseDocument {
  type: 'user'
  provider: 'github' | 'google' | 'token' | 'anonymous'
  name: string
  avatar: string
  email: string
  emailVerified: boolean
  createdAt: string
  updatedAt: string
  lastSeen: string
  isAdmin: boolean
  permissions: string[]
  tokens: string[]
  sessions: string[]
  todos: string[]
  settings: Record<string, string>
  preferences: Record<string, string>
  // Provider-specific IDs
  googleId?: string
  githubId?: string
  // GitHub-specific fields for linking
  githubName?: string
  githubAvatar?: string
  githubUrl?: string
}
