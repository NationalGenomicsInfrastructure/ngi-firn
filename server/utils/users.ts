import { couchDB } from '../database/couchdb'
import type { FirnUser, GoogleUser, GitHubUser, SessionUser } from '../../types/auth'

export class UserService {
  /**
   * Create a new FirnUser
   */
  static async createUser(user: FirnUser): Promise<{ user: FirnUser }> {
    const result = await couchDB.createDocument(user)
    return { user: { ...user, _id: result.id, _rev: result.rev } as FirnUser }
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
} 