import { couchDB } from '../database/couchdb'
import type { User } from '../../types/auth'

export interface OAuthUser {
  provider: 'google' | 'github'
  providerId: string
  name: string
  email: string
  avatar?: string
  url?: string
}

export class UserService {
  /**
   * Find or create a user during OAuth login
   * Google is the source of truth, GitHub can be linked as secondary
   */
  static async findOrCreateUser(oauthUser: OAuthUser): Promise<{ user: User; isNew: boolean }> {
    // First, try to find user by email (Google is source of truth)
    const existingUserByEmail = await couchDB.queryDocuments<User>({
      type: 'user',
      email: oauthUser.email
    })

    if (existingUserByEmail.length > 0) {
      const user = existingUserByEmail[0]
      
      // Update user information and last login
      const updates: Partial<User> = {
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // If this is a Google login, update Google-specific fields
      if (oauthUser.provider === 'google') {
        updates.googleId = oauthUser.providerId
        updates.name = oauthUser.name
        updates.avatar = oauthUser.avatar || user.avatar
      }

      // If this is a GitHub login, check if it's already linked
      if (oauthUser.provider === 'github') {
        // Check if this GitHub account is already linked to another user
        const existingUserByGitHub = await couchDB.queryDocuments<User>({
          type: 'user',
          githubId: oauthUser.providerId
        })

        if (existingUserByGitHub.length > 0 && existingUserByGitHub[0]._id !== user._id) {
          throw new Error('This GitHub account is already linked to another user')
        }

        // Link GitHub account to this user
        updates.githubId = oauthUser.providerId
        updates.githubName = oauthUser.name
        updates.githubAvatar = oauthUser.avatar
        updates.githubUrl = oauthUser.url
      }

      // Update the user
      await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
      return { user: { ...user, ...updates }, isNew: false }
    }

    // User doesn't exist, create new user
    const newUser: Omit<User, '_id' | '_rev'> = {
      type: 'user',
      provider: oauthUser.provider,
      name: oauthUser.name,
      avatar: oauthUser.avatar || '',
      email: oauthUser.email,
      emailVerified: oauthUser.provider === 'google', // Google emails are verified
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isAdmin: false,
      permissions: [], // New users are not approved by default
      tokens: [],
      sessions: [],
      todos: [],
      settings: {},
      preferences: {}
    }

    // Set provider-specific fields
    if (oauthUser.provider === 'google') {
      newUser.googleId = oauthUser.providerId
    } else if (oauthUser.provider === 'github') {
      newUser.githubId = oauthUser.providerId
      newUser.githubName = oauthUser.name
      newUser.githubAvatar = oauthUser.avatar
      newUser.githubUrl = oauthUser.url
    }

    const result = await couchDB.createDocument(newUser)
    return { user: { _id: result.id, _rev: result.rev, ...newUser } as User, isNew: true }
  }

  /**
   * Check if user is approved to access the system
   */
  static async isUserApproved(userId: string): Promise<boolean> {
    const user = await couchDB.getDocument<User>(userId)
    return user ? user.permissions.includes('approved') : false
  }

  /**
   * Check if user is an admin
   */
  static async isUserAdmin(userId: string): Promise<boolean> {
    const user = await couchDB.getDocument<User>(userId)
    return user ? (user.isAdmin || user.permissions.includes('admin')) : false
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User | null> {
    return await couchDB.getDocument<User>(userId)
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    const users = await couchDB.queryDocuments<User>({
      type: 'user',
      email: email
    })
    return users[0] || null
  }

  /**
   * Get user by provider ID
   */
  static async getUserByProviderId(provider: 'google' | 'github', providerId: string): Promise<User | null> {
    const users = await couchDB.queryDocuments<User>({
      type: 'user',
      [`${provider}Id`]: providerId
    })
    return users[0] || null
  }

  /**
   * Approve a user
   */
  static async approveUser(userId: string): Promise<void> {
    const user = await couchDB.getDocument<User>(userId)
    if (!user) {
      throw new Error('User not found')
    }

    if (!user.permissions.includes('approved')) {
      user.permissions = [...user.permissions, 'approved']
      user.updatedAt = new Date().toISOString()
      await couchDB.updateDocument(userId, user, user._rev!)
    }
  }

  /**
   * Reject a user
   */
  static async rejectUser(userId: string): Promise<void> {
    const user = await couchDB.getDocument<User>(userId)
    if (!user) {
      throw new Error('User not found')
    }

    user.permissions = user.permissions.filter(p => p !== 'approved')
    user.updatedAt = new Date().toISOString()
    await couchDB.updateDocument(userId, user, user._rev!)
  }

  /**
   * Get all pending users
   */
  static async getPendingUsers(): Promise<User[]> {
    const users = await couchDB.queryDocuments<User>({
      type: 'user'
    })
    return users.filter(user => !user.permissions.includes('approved'))
  }

  /**
   * Get all approved users
   */
  static async getApprovedUsers(): Promise<User[]> {
    const users = await couchDB.queryDocuments<User>({
      type: 'user'
    })
    return users.filter(user => user.permissions.includes('approved'))
  }
} 