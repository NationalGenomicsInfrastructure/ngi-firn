import { couchDB } from '../database/couchdb'
import type { FirnUser, GoogleUser, GitHubUser, SessionUser, SessionUserSecure } from '../../types/auth'

export class UserService {
  /**
   * Create a new FirnUser
   */
  static async createUser(user: Omit<FirnUser, '_id' | '_rev'>): Promise<FirnUser | null> {
    const document = await couchDB.createDocument(user)
    // query the new user by document id
    const newUser = await couchDB.queryDocuments<FirnUser>({
      type: 'user', 
      _id: document.id
    })
    return newUser[0] as FirnUser
  }
  
  /**
   * Match a Google OAuth user to a FirnUser
   * Returns null if no user is found, allowing for conditional handling
   */
  static async matchGoogleUser(oauthUser: GoogleUser): Promise<FirnUser | null> {
    // First, try to find user by Google ID (Google is source of truth)
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleId: oauthUser.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const user = existingUserByGoogleId[0]
      
      // Update user information and last login
      const updates: Partial<FirnUser> = {
        lastSeenAt: new Date().toISOString(),
        // Update Google profile information in case it changed
        googleName: oauthUser.googleName,
        googleGivenName: oauthUser.googleGivenName,
        googleFamilyName: oauthUser.googleFamilyName,
        googleAvatar: oauthUser.googleAvatar,
        googleEmail: oauthUser.googleEmail,
        googleEmailVerified: oauthUser.googleEmailVerified
      }

      // Update the user
      await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
      return { ...user, ...updates } as FirnUser
    }

    // No user found - return null to indicate new or unknown user
    return null
  }

  /**
   * Match a GitHub OAuth user to a FirnUser
   * Returns null if no user is found, allowing for conditional handling
   */
    static async matchGitHubUser(oauthUser: GitHubUser): Promise<FirnUser | null> {
      // First, try to find user by GitHub ID 
      const existingUserByGitHubId = await couchDB.queryDocuments<FirnUser>({
        type: 'user',
        githubId: oauthUser.githubId
      })
  
      if (existingUserByGitHubId.length > 0) {
        const user = existingUserByGitHubId[0]
        
        // Update user information and last login
        const updates: Partial<FirnUser> = {
          lastSeenAt: new Date().toISOString(),
          // Update GitHub profile information in case it changed
          githubName: oauthUser.githubName,
          githubAvatar: oauthUser.githubAvatar,
          githubEmail: oauthUser.githubEmail,
          githubUrl: oauthUser.githubUrl
        }
  
        // Update the user
        await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates } as FirnUser
      }
  
      // No user found - return null to indicate new or unknown user
      return null
    }

  /**
   * Match a SessionUserSecure to a FirnUser
   * Returns null if no user is found
   */
    static async matchSessionUserSecure(sessionUserSecure: SessionUserSecure): Promise<FirnUser | null> {
      // First, try to find user by Document ID 
      const existingUserByDocumentId = await couchDB.queryDocuments<FirnUser>({
        type: 'user', 
        _id: sessionUserSecure.id
      })
  
      return existingUserByDocumentId[0] as FirnUser
    }

  /**
   * Get all pending users
   */
  static async getPendingUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => !user.allowLogin && !user.isRetired)
  }

  /**
   * Get all retired users
   */
    static async getRetiredUsers(): Promise<FirnUser[]> {
      const users = await couchDB.queryDocuments<FirnUser>({
        type: 'user'
      })
      return users.filter(user => !user.isRetired)
    }

  /**
   * Get all active users
   */
  static async getApprovedUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => user.allowLogin)
  }

  /**
   * Convert a FirnUser to a SessionUser
   */
  static async convertToSessionUser(user: FirnUser, provider: 'google' | 'github' | 'token'): Promise<[SessionUser, SessionUserSecure]> {

    let avatar: string | null = null
    let name: string

    if (provider === 'github') {
      avatar = user.githubAvatar
      name = user.githubName || user.googleName
    } else {
      avatar = user.googleAvatar
      name = user.googleName
    }

    const sessionUser: SessionUser = {
      provider: provider,
      name: name,
      givenName: user.googleGivenName,
      familyName: user.googleFamilyName,
      avatar: avatar,
      linkedGitHub: user.githubId ? true : false,
      allowLoginClientside: user.allowLogin,
      isRetiredClientside: user.isRetired
    }

    const sessionUserSecure: SessionUserSecure = {
      id: user._id,
      rev: user._rev,
      allowLogin: user.allowLogin,
      isRetired: user.isRetired,
      isAdmin: user.isAdmin,
      permissions: user.permissions
    }

    return [sessionUser, sessionUserSecure]
  }

  /**
   * Convert a GoogleUser to a FirnUser
   */
  static async convertGoogleUserToFirnUser(googleUser: GoogleUser): Promise<FirnUser> {

    // Create new user from GoogleUser with all required FirnUser fields
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'> = 
    {
      type: 'user',
      // Google-specific fields
      googleId: googleUser.googleId,
      googleName: googleUser.googleName,
      googleGivenName: googleUser.googleGivenName,
      googleFamilyName: googleUser.googleFamilyName,
      googleAvatar: googleUser.googleAvatar,
      googleEmail: googleUser.googleEmail,
      googleEmailVerified: googleUser.googleEmailVerified,
      // GitHub-specific fields (null for new users)
      githubId: null,
      githubName: null,
      githubAvatar: null,
      githubEmail: null,
      githubUrl: null,
      // Timestamps
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      // User properties (new users are not approved by default)
      allowLogin: false,
      isRetired: false,
      isAdmin: false,
      permissions: [],
      tokens: [],
      sessions: [],
      // User-related collections
      todos: [],
      preferences: []
    }
    return newFirnUser as FirnUser
  }
} 