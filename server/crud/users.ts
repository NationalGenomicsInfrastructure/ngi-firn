/*
 * UserService - Table of Contents
 * *********************************
 *
 * CREATION AND ADMINISTRATION:
 * createUser(user) - Create a new FirnUser with all required fields
 * createUserByAdmin(user) - Create a new, partially filled FirnUser by an admin
 * deleteUserByAdmin(user) - Delete a user by an admin
 * setUserAccessByAdmin(user) - Set access of a user by an admin: Allow login, retire, or promote to admin
 * linkGitHubUser(user, githubUser) - Link a GitHubUser to a FirnUser
 * MATCHING - QUERYING WITH DIFFERENT INPUTS AND GET FULL USER OBJECT:
 * matchGoogleUser(oauthUser) - Match a Google OAuth user to a FirnUser based on Google ID
 * matchGoogleUserByGoogleId(googleId) - Match a GoogleID to a FirnUser
 * matchGitHubUser(oauthUser) - Match a GitHub OAuth user to a FirnUser based on GitHub ID
 * matchSessionUserSecure(sessionUserSecure) - Match a SessionUserSecure to a FirnUser
 * LISTING USERS:
 * getPendingUsers() - Get all pending users (not allowed to login and not retired)
 * getRetiredUsers() - Get all retired users
 * getApprovedUsers() - Get all active users (allowed to login)
 * USER TYPE CONVERSION:
 * convertToSessionUser(user, provider) - Convert a FirnUser to a SessionUser (for authentication)
 * convertToDisplayUserToAdmin(user) - Convert a FirnUser to a DisplayUserToAdmin (for administrative UI display)
 * convertGoogleUserToFirnUser(googleUser) - Convert a GoogleUser to a FirnUser (for creating a new user)
 */

import { DateTime } from 'luxon'

import { couchDB } from '../database/couchdb'
import type { FirnUser, GoogleUser, GoogleUserQuery, GitHubUser, SessionUser, SessionUserSecure, DisplayUserToAdmin } from '../../types/auth'
import type { CreateUserByAdminInput, SetUserAccessByAdminInput, DeleteUserByAdminInput } from '../../schemas/users'

export const UserService = {
  /*
   * Create a new FirnUser
   */
  async createUser(user: Omit<FirnUser, '_id' | '_rev'>): Promise<FirnUser | null> {
    const document = await couchDB.createDocument(user)
    // query the new user by document id
    const newUser = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      _id: document.id
    })
    return newUser[0] as FirnUser
  },

  /*
   * Create a new, partially filled FirnUser by an admin
   */
  async createUserByAdmin(user: CreateUserByAdminInput): Promise<FirnUser | null> {
    // Create a new user with the admin's input
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'>
    = {
      type: 'user',
      schema: 1,
      // Google-specific fields
      // Generate a random provisional googleId (9-digit number in a reserved range)
      googleId: Math.floor(900000000 + Math.random() * 100000000),
      googleName: '',
      googleGivenName: user.googleGivenName,
      googleFamilyName: user.googleFamilyName,
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
      createdAt: DateTime.now().toISO(),
      lastSeenAt: DateTime.now().toISO(),
      // User properties (new users are not approved by default)
      allowLogin: true,
      isRetired: false,
      isAdmin: user.isAdmin,
      permissions: [],
      tokens: [],
      sessions: [],
      // User-related collections
      todos: [],
      preferences: []
    }

    // Since the GoogleID is provisional and random, there is a tiny chance that the ID is already taken.
    // If so, we need to generate a new one.
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleId: newFirnUser.googleId
    })
    if (existingUserByGoogleId.length > 0) {
      // Generate a new random GoogleID
      newFirnUser.googleId = Math.floor(900000000 + Math.random() * 100000000)
    }

    // Check if the user already exists by e-mail address
    const existingUserByGoogleMail = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleEmail: newFirnUser.googleEmail
    })
    if (existingUserByGoogleMail.length > 0) {
      // User already exists - throw an explicit error to indicate that the user already exists
      throw new Error('User with this email already exists')
    }

    // Create the user
    const document = await couchDB.createDocument(newFirnUser)
    // query the new user by document id
    const newUser = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      _id: document.id
    })
    return newUser[0] as FirnUser
  },

  /*
   * Delete a user by an admin
   */
  async deleteUserByAdmin(user: DeleteUserByAdminInput): Promise<FirnUser | null> {
    // First, try to find user by Google ID
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleId: user.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const user = existingUserByGoogleId[0]
      // Delete the user
      await couchDB.deleteDocument(user._id, user._rev!)
      return user as FirnUser
    }
    else {
      // User not found - return null to indicate that the user does not exist
      return null
    }
  },

  /*
   * Set access of a user by an admin: Allow login, retire, or promote to admin.
   */
  async setUserAccessByAdmin(userSettings: SetUserAccessByAdminInput): Promise<FirnUser | null> {
    // First, try to find user by Google ID (Google is source of truth)
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleId: userSettings.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const user = existingUserByGoogleId[0]

      // Update user information
      const updates: Partial<FirnUser> = {
        allowLogin: userSettings.allowLogin,
        isRetired: userSettings.isRetired,
        isAdmin: userSettings.isAdmin
      }

      // TypeScript can't guarantee that existingUserByGoogleId[0] is defined,
      // even though we checked length > 0. To help the typechecker, we can use a type guard.
      if (user) {
        const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
      }
    }

    // No user found - return null to indicate new or unknown user
    return null
  },

  /*
   * Link a GitHubUser to a FirnUser
   */
  async linkGitHubUser(user: FirnUser, githubUser: GitHubUser): Promise<FirnUser | null> {
    // Update user information and last login
    const linkedAccount: Partial<FirnUser> = {
      lastSeenAt: DateTime.now().toISO(),
      githubId: githubUser.githubId,
      githubNodeId: githubUser.githubNodeId,
      githubName: githubUser.githubName,
      githubAvatar: githubUser.githubAvatar,
      githubEmail: githubUser.githubEmail,
      githubUrl: githubUser.githubUrl
    }

    if (user) {
      // Update the user
      const result = await couchDB.updateDocument(user._id, { ...user, ...linkedAccount }, user._rev!)
      return { ...user, ...linkedAccount, _id: result.id, _rev: result.rev } as FirnUser
    }
    return null
  },

  /*
   * Match a Google OAuth user to a FirnUser based on Google ID
   * Returns null if no user is found, allowing for conditional handling
   */
  async matchGoogleUser(oauthUser: GoogleUser): Promise<FirnUser | null> {
    // First, try to find user by Google ID (Google is source of truth)
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      googleId: oauthUser.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const user = existingUserByGoogleId[0]

      // Update user information and last login
      const updates: Partial<FirnUser> = {
        lastSeenAt: DateTime.now().toISO(),
        googleName: oauthUser.googleName,
        googleGivenName: oauthUser.googleGivenName,
        googleFamilyName: oauthUser.googleFamilyName,
        googleAvatar: oauthUser.googleAvatar,
        googleEmail: oauthUser.googleEmail,
        googleEmailVerified: oauthUser.googleEmailVerified
      }

      // Update the user
      if (user) {
        const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
      }
      else {
        return null
      }
    }
    else {
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
          lastSeenAt: DateTime.now().toISO(),
          googleId: oauthUser.googleId,
          googleName: oauthUser.googleName,
          googleGivenName: oauthUser.googleGivenName,
          googleFamilyName: oauthUser.googleFamilyName,
          googleAvatar: oauthUser.googleAvatar
        }

        // Update the user
        if (user) {
          const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
          return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
        }
        else {
          return null
        }
      }
      else {
      // No user found either by Google ID or e-mail address - return null to indicate new, unknown user
        return null
      }
    }
  },

  /*
   * Match a GoogleID/e-mail to a FirnUser - needed for some admin actions on other users.
   * Returns null if no user is found, allowing for conditional handling
   */
    async matchGoogleUserByGoogleQuery(googleQuery: GoogleUserQuery): Promise<FirnUser | null> {
      // First, try to find user by Google ID (Google is source of truth)
      const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
        type: 'user',
        googleId: googleQuery.googleId
      })

      if (existingUserByGoogleId.length > 0) {
          const user = existingUserByGoogleId[0] as FirnUser
          // check if it is really the correct user based on e-mail
          if (user.googleEmail === googleQuery.googleEmail){
            return user as FirnUser
          } else {
            return null
          }
      } else {
        return null
      }
    },

  /*
   * Match a GitHub OAuth user to a FirnUser based on GitHub ID
   * Returns null if no user is found, allowing for conditional handling
   */
  async matchGitHubUser(oauthUser: GitHubUser): Promise<FirnUser | null> {
    // Find user by GitHub ID, matching based on the e-mail address is too flaky.
    const existingUserByGitHubId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      githubId: oauthUser.githubId
    })

    if (existingUserByGitHubId.length > 0) {
      const user = existingUserByGitHubId[0]

      // Update user information and last login
      const updates: Partial<FirnUser> = {
        lastSeenAt: DateTime.now().toISO(),
        githubNodeId: oauthUser.githubNodeId,
        githubName: oauthUser.githubName,
        githubAvatar: oauthUser.githubAvatar,
        githubEmail: oauthUser.githubEmail,
        githubUrl: oauthUser.githubUrl
      }

      // Update the user
      if (user) {
        const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
      }
      else {
        return null
      }
    }

    // No user found - return null to indicate new or unknown user
    return null
  },

  /*
   * Match a SessionUserSecure to a FirnUser
   * Returns null if no user is found
   */
  async matchSessionUserSecure(sessionUserSecure: SessionUserSecure): Promise<FirnUser | null> {
    // First, try to find user by Document ID
    const existingUserByDocumentId = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      _id: sessionUserSecure.id
    })

    return existingUserByDocumentId[0] as FirnUser
  },

  /*
   * Get all pending users
   */
  async getPendingUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => !user.allowLogin && !user.isRetired)
  },

  /*
   * Get all retired users
   */
  async getRetiredUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => user.isRetired)
  },

  /*
   * Get all active users
   */
  async getApprovedUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'user'
    })
    return users.filter(user => user.allowLogin)
  },

  /*
   * Convert a FirnUser to a SessionUser
   */
  async convertToSessionUser(user: FirnUser, provider: 'google' | 'github' | 'token'): Promise<[SessionUser, SessionUserSecure]> {
    let avatar: string | null = null
    let name: string

    if (provider === 'github') {
      avatar = user.githubAvatar
      name = user.githubName || user.googleName
    }
    else {
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
      isRetiredClientside: user.isRetired,
      isAdminClientside: user.isAdmin
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
  },

  /*
   * Convert a FirnUser to a DisplayUserToAdmin
   */
  async convertToDisplayUserToAdmin(user: FirnUser): Promise<DisplayUserToAdmin> {
    const displayUser: DisplayUserToAdmin = {
      googleId: user.googleId,
      googleName: user.googleName,
      googleGivenName: user.googleGivenName,
      googleFamilyName: user.googleFamilyName,
      googleAvatar: user.googleAvatar,
      googleEmail: user.googleEmail,
      githubId: user.githubId,
      githubAvatar: user.githubAvatar,
      githubUrl: user.githubUrl,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      allowLogin: user.allowLogin,
      isRetired: user.isRetired,
      isAdmin: user.isAdmin,
      permissions: user.permissions,
      tokens: user.tokens
    }
    return displayUser
  },

  /*
   * Convert a GoogleUser to a FirnUser
   */
  async convertGoogleUserToFirnUser(googleUser: GoogleUser): Promise<FirnUser> {
    // Create new user from GoogleUser with all required FirnUser fields
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'>
    = {
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
      createdAt: DateTime.now().toISO(),
      lastSeenAt: DateTime.now().toISO(),
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
