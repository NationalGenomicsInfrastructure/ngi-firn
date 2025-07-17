/*
 * UserService - Table of Contents
 * *********************************
 * 
 * CREATION AND ADMINISTRATION:
 * createUser(user) - Create a new FirnUser with all required fields
 * createUserByAdmin(user) - Create a new, partially filled FirnUser by an admin
 * setUserAccessByAdmin(user) - Set access of a user by an admin: Allow login, retire, or promote to admin
 * linkGitHubUser(user, githubUser) - Link a GitHubUser to a FirnUser
 * MATCHING - QUERYING WITH DIFFERENT INPUTS AND GET FULL USER OBJECT:
 * matchGoogleUser(oauthUser) - Match a Google OAuth user to a FirnUser based on Google ID
 * matchGitHubUser(oauthUser) - Match a GitHub OAuth user to a FirnUser based on GitHub ID
 * matchSessionUserSecure(sessionUserSecure) - Match a SessionUserSecure to a FirnUser
 * LISTING USERS:
 * getPendingUsers() - Get all pending users (not allowed to login and not retired)
 * getRetiredUsers() - Get all retired users
 * getApprovedUsers() - Get all active users (allowed to login)
 * USER TYPE CONVERSION:
 * convertToSessionUser(user, provider) - Convert a FirnUser to a SessionUser
 * convertGoogleUserToFirnUser(googleUser) - Convert a GoogleUser to a FirnUser
 */

import { couchDB } from '../database/couchdb'
import type { FirnUser, GoogleUser, GitHubUser, SessionUser, SessionUserSecure } from '../../types/auth'
import type { CreateUserByAdminInput, SetUserAccessByAdminInput } from '../../types/users'

export class UserService {

  /*
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

  /*
   * Create a new, partially filled FirnUser by an admin
   */
  static async createUserByAdmin(user: CreateUserByAdminInput): Promise<FirnUser | null> {

    // Create a new user with the admin's input
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'> = 
    {
      type: 'user',
      schema: 1,
      // Google-specific fields
      googleId: 0,
      googleName: '',
      googleGivenName: '',
      googleFamilyName: '',
      googleAvatar: '',
      googleEmail: user.googleEmail,
      googleEmailVerified: true,
      // GitHub-specific fields (null for new users)
      githubId: null,
      githubNodeId: null,
      githubName: null,
      githubAvatar: null,
      githubEmail: null,
      githubUrl: null,
      // Timestamps
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      // User properties (new users are not approved by default)
      allowLogin: user.allowLogin,
      isRetired: user.isRetired,
      isAdmin: user.isAdmin,
      permissions: [],
      tokens: [],
      sessions: [],
      // User-related collections
      todos: [],
      preferences: []
    }

    // Create the user
    const document = await couchDB.createDocument(newFirnUser)
    // query the new user by document id
    const newUser = await couchDB.queryDocuments<FirnUser>({
      type: 'user', 
      _id: document.id
    })
    return newUser[0] as FirnUser
  }

  /*
   * Set access of a user by an admin: Allow login, retire, or promote to admin.
   */
    static async setUserAccessByAdmin(user: SetUserAccessByAdminInput): Promise<FirnUser | null> {
      // First, try to find user by Google ID (Google is source of truth)
      const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
        type: 'user',
        googleId: user.googleId
      })
  
      if (existingUserByGoogleId.length > 0) {
        const user = existingUserByGoogleId[0]
        
        // Update user information and last login
        const updates: Partial<FirnUser> = {
          allowLogin: user.allowLogin,
          isRetired: user.isRetired,
          isAdmin: user.isAdmin
        }
  
        // Update the user
        await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates } as FirnUser
      }
  
      // No user found - return null to indicate new or unknown user
      return null
    }

  /*
   * Link a GitHubUser to a FirnUser
   */
      static async linkGitHubUser(user: FirnUser, githubUser: GitHubUser): Promise<FirnUser | null> {
        // Update user information and last login
        const linkedAccount: Partial<FirnUser> = {
          lastSeenAt: new Date().toISOString(),
          githubId: githubUser.githubId,
          githubNodeId: githubUser.githubNodeId,
          githubName: githubUser.githubName,
          githubAvatar: githubUser.githubAvatar,
          githubEmail: githubUser.githubEmail,
          githubUrl: githubUser.githubUrl
        }
  
        // Update the user
        await couchDB.updateDocument(user._id, { ...user, ...linkedAccount }, user._rev!)
        return { ...user, ...linkedAccount } as FirnUser
      }
  
  /*
   * Match a Google OAuth user to a FirnUser based on Google ID
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
    
    } else {
      // No user found by Google ID, try by e-mail address (only for Google, only for pre-created users)
      // When an admin creates a user in advance, they know the e-mail address, but not the Google ID
      // When a user self-registers, we can get the GoogleID directly from the OAuth response.
      const existingUserByEmail = await couchDB.queryDocuments<FirnUser>({
        type: 'user',
        googleEmail: oauthUser.googleEmail
      })

      if (existingUserByEmail.length > 0) {
        const user = existingUserByEmail[0]
        
        // Update user information and last login
        const updates: Partial<FirnUser> = {
          lastSeenAt: new Date().toISOString(),
          googleId: oauthUser.googleId,
          googleName: oauthUser.googleName,
          googleGivenName: oauthUser.googleGivenName,
          googleFamilyName: oauthUser.googleFamilyName,
          googleAvatar: oauthUser.googleAvatar,
        }
  
        // Update the user
        await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates } as FirnUser
      
    } else {
      // No user found either by Google ID or e-mail address - return null to indicate new, unknown user
      return null
    }
  }}

  /*
   * Match a GitHub OAuth user to a FirnUser based on GitHub ID
   * Returns null if no user is found, allowing for conditional handling
   */
    static async matchGitHubUser(oauthUser: GitHubUser): Promise<FirnUser | null> {
      // Find user by GitHub ID, matching based on the e-mail address is too flaky.
      const existingUserByGitHubId = await couchDB.queryDocuments<FirnUser>({
        type: 'user',
        githubId: oauthUser.githubId
      })
  
      if (existingUserByGitHubId.length > 0) {
        const user = existingUserByGitHubId[0]
        
        // Update user information and last login
        const updates: Partial<FirnUser> = {
          lastSeenAt: new Date().toISOString(),
          githubNodeId: oauthUser.githubNodeId,
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

  /*
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

  /*
   * Get all pending users
   */
  static async getPendingUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => !user.allowLogin && !user.isRetired)
  }

  /*
   * Get all retired users
   */
    static async getRetiredUsers(): Promise<FirnUser[]> {
      const users = await couchDB.queryDocuments<FirnUser>({
        type: 'user'
      })
      return users.filter(user => !user.isRetired)
    }

  /*
   * Get all active users
   */
  static async getApprovedUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => user.allowLogin)
  }

  /*
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

  /*
   * Convert a GoogleUser to a FirnUser
   */
  static async convertGoogleUserToFirnUser(googleUser: GoogleUser): Promise<FirnUser> {

    // Create new user from GoogleUser with all required FirnUser fields
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'> = 
    {
      type: 'user',
      schema: 1,
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
      githubNodeId: null,
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