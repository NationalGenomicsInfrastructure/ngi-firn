/*
 * UserService - Table of Contents
 * *********************************
 *
 * CREATION AND ADMINISTRATION:
 * generateUniqueFirnIdAndGoogleId() - Generate a unique firnId and googleId for a new user
 * createUser(user) - Create a new FirnUser with all required fields
 * createUserByAdmin(user) - Create a new, partially filled FirnUser by an admin
 * deleteUserByAdmin(user) - Delete a user by an admin
 * setUserAccessByAdmin(user) - Set access of a user by an admin: Allow login, retire, or promote to admin
 * linkGitHubUser(user, githubUser) - Link a GitHubUser to a FirnUser
 * unlinkGitHubUser(user) - Unlink a GitHubUser from a FirnUser
 * MATCHING - QUERYING WITH DIFFERENT INPUTS AND GET FULL USER OBJECT:
 * matchFirnUserByFirnQuery(firnQuery) - Match a FirnUser by firnId
 * matchGoogleUser(oauthUser) - Match a Google OAuth user to a FirnUser based on Google ID
 * matchGoogleUserByGoogleQuery(googleQuery) - Match a GoogleID/e-mail to a FirnUser
 * matchGitHubUser(oauthUser) - Match a GitHub OAuth user to a FirnUser based on GitHub ID
 * matchSessionUserSecure(sessionUserSecure) - Match a SessionUserSecure to a FirnUser
 * LISTING USERS:
 * getPendingUsers() - Get all pending users (not allowed to login and not retired)
 * getRetiredUsers() - Get all retired users
 * getApprovedUsers() - Get all active users (allowed to login)
 * PROJECT BOOKMARKS:
 * getProjectBookmarks(user) - Get all project bookmarks for a user
 * addProjectBookmark(user, project) - Add a project bookmark for a user
 * removeProjectBookmark(user, project) - Remove a project bookmark for a user
 * TODO DOCUMENTS (user-linked):
 * createTodoDocumentForUser(user, input) - Create a TodoDocument with user as owner and add ref to user.todoDocuments
 * deleteTodoDocumentForUser(user, todoDocument) - Delete a TodoDocument and remove its ref from user.todoDocuments
 * addUserAsOwnerOrViewer(user, todoDocument, role) - Add user as owner or viewer of a TodoDocument
 * removeUserAsOwnerOrViewer(user, todoDocument, role) - Remove user as owner or viewer of a TodoDocument
 * USER TYPE CONVERSION:
 * convertToSessionUser(user, provider) - Convert a FirnUser to a SessionUser (for authentication)
 * convertToDisplayUserToAdmin(user) - Convert a FirnUser to a DisplayUserToAdmin (for administrative UI display)
 * convertGoogleUserToFirnUser(googleUser) - Convert a GoogleUser to a FirnUser (for creating a new user)
 */

import { DateTime } from 'luxon'

import { couchDB } from '../database/couchdb'
import { ProductivityService } from './productivity.server'
import type { FirnUser, FirnUserQuery, GoogleUser, GoogleUserQuery, GitHubUser, SessionUser, SessionUserSecure, DisplayUserToAdmin } from '../../types/auth'
import type { FirnProjectBookmark } from '../../types/projects-firn'
import type { TodoDocument } from '../../types/productivity'
import type { TypedDocumentReference } from '../../types/references'
import type { CreateUserByAdminInput, SetUserAccessByAdminInput, DeleteUserByAdminInput } from '../../schemas/users'

function userToRef(user: FirnUser): TypedDocumentReference<FirnUser> {
  return { db: couchDB.database, id: user._id }
}

function todoDocToRef(doc: TodoDocument): TypedDocumentReference<TodoDocument> {
  return { db: couchDB.database, id: doc._id }
}

export const UserService = {
  /**
   * Generate unique firnId and googleId for a new user. The firnId is a short unique identifier for the user
   * and is used for the barcode login and share links.
   * The true googleID is provided by and stored upon the first successful Google OAuth login,
   * but in order to pre-create user accounts, we need to generate a unique fake googleId as placeholder.
   * @returns A promise that resolves to an object containing the unique firnId and googleId.
   */
  async generateUniqueFirnIdAndGoogleId(): Promise<{ firnId: string, googleId: number }> {
    // Query all user documents to find existing firnIds and googleIds.
    const users = await couchDB.queryDocuments<FirnUser>({ type: 'firnUser' })

    const existingFirnIds: string[] = []
    const existingGoogleIds: number[] = []

    for (const user of users) {
      existingFirnIds.push(user.firnId)
      existingGoogleIds.push(user.googleId)
    }

    // Generate a unique firnId
    let newFirnId: string
    do {
      newFirnId = Math.random().toString(36).substring(3, 7)
    } while (existingFirnIds.some(firnId => firnId === newFirnId))

    // Generate a random provisional GoogleID (9-digit number in a reserved range)
    let newGoogleId: number
    do {
      newGoogleId = Math.floor(900000000 + Math.random() * 100000000)
    } while (existingGoogleIds.some(googleId => googleId === newGoogleId))

    return { firnId: newFirnId, googleId: newGoogleId }
  },

  /*
   * Create a new FirnUser
   */
  async createUser(user: Omit<FirnUser, '_id' | '_rev'>): Promise<FirnUser | null> {
    const document = await couchDB.createDocument(user)
    // query the new user by document id
    const newUser = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
      _id: document.id
    })
    return newUser[0] as FirnUser
  },

  /*
   * Create a new, partially filled FirnUser by an admin
   */
  async createUserByAdmin(user: CreateUserByAdminInput): Promise<FirnUser | null> {
    // Generate a unique firnId and googleId for the new user
    const { firnId, googleId } = await UserService.generateUniqueFirnIdAndGoogleId()

    // Create a new user with the admin's input
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'>
      = {
        type: 'firnUser',
        schema: 1,
        firnId: firnId,
        // Google-specific fields
        googleId: googleId,
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
        // User properties (new users are allowed to login by default here)
        allowLogin: true,
        isRetired: false,
        isAdmin: user.isAdmin,
        // User-related arrays and collections
        permissions: [],
        tokens: [],
        projectBookmarks: [],
        todos: [],
        preferences: []
      }

    // Check if the user already exists by e-mail address
    const existingUserByGoogleMail = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
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
      type: 'firnUser',
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
      type: 'firnUser',
      googleId: user.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const foundUser = existingUserByGoogleId[0]
      if (foundUser) {
        // Delete the user
        await couchDB.deleteDocument(foundUser._id, foundUser._rev!)
        return foundUser as FirnUser
      }
    }
    // User not found - return null to indicate that the user does not exist
    return null
  },

  /*
   * Set access of a user by an admin: Allow login, retire, or promote to admin.
   */
  async setUserAccessByAdmin(userSettings: SetUserAccessByAdminInput): Promise<FirnUser | null> {
    // First, try to find user by Google ID (Google is source of truth)
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
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
   * Unlink a GitHubUser from a FirnUser
   */
  async unlinkGitHubUser(user: FirnUser): Promise<FirnUser | null> {
    // Update user information and last login
    const unlinkedAccount: Partial<FirnUser> = {
      lastSeenAt: DateTime.now().toISO(),
      githubId: null,
      githubNodeId: null,
      githubName: null,
      githubAvatar: null,
      githubEmail: null,
      githubUrl: null
    }

    if (user) {
      // Update the user
      const result = await couchDB.updateDocument(user._id, { ...user, ...unlinkedAccount }, user._rev!)
      return { ...user, ...unlinkedAccount, _id: result.id, _rev: result.rev } as FirnUser
    }
    return null
  },

  /*
   * Match a FirnUser by firnId
   */
  async matchFirnUserByFirnQuery(firnQuery: FirnUserQuery): Promise<FirnUser | null> {
    const existingUserByFirnId = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
      firnId: firnQuery.firnId
    })

    if (existingUserByFirnId.length > 0) {
      const user = existingUserByFirnId[0]
      if (user && user.firnId === firnQuery.firnId) {
        // Update last login
        const updates: Partial<FirnUser> = {
          lastSeenAt: DateTime.now().toISO()
        }
        const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
        return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
      }
    }
    // No user found by firnId - return null to indicate new, unknown user
    return null
  },

  /*
   * Match a Google OAuth user to a FirnUser based on Google ID
   * Returns null if no user is found, allowing for conditional handling
   */
  async matchGoogleUser(oauthUser: GoogleUser): Promise<FirnUser | null> {
    // First, try to find user by Google ID (Google is source of truth)
    const existingUserByGoogleId = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
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
      /*
      * No user found by Google ID, try by e-mail address (only for Google, only for pre-created users)
      * When an admin creates a user in advance, they know the e-mail address, but not the Google ID
      * When a user self-registers, we can get the GoogleID directly from the OAuth response.
      */
      const existingUserByEmail = await couchDB.queryDocuments<FirnUser>({
        type: 'firnUser',
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
      type: 'firnUser',
      googleId: googleQuery.googleId
    })

    if (existingUserByGoogleId.length > 0) {
      const user = existingUserByGoogleId[0] as FirnUser
      // check if it is really the correct user based on e-mail
      if (user.googleEmail === googleQuery.googleEmail) {
        return user as FirnUser
      }
      else {
        return null
      }
    }
    else {
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
      type: 'firnUser',
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
      type: 'firnUser',
      _id: sessionUserSecure.id
    })

    return existingUserByDocumentId[0] as FirnUser
  },

  /*
   * Get all pending users
   */
  async getPendingUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
      allowLogin: false,
      isRetired: false
    })
    return users
  },

  /*
   * Get all retired users
   */
  async getRetiredUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
      isRetired: true
    })
    return users
  },

  /*
   * Get all active users
   */
  async getApprovedUsers(): Promise<FirnUser[]> {
    const users = await couchDB.queryDocuments<FirnUser>({
      type: 'firnUser',
      allowLogin: true
    })
    return users
  },

  /*
   * PROJECT BOOKMARKS
   */

  /**
   * Get all project bookmarks for a user.
   * Lightweight helper that simply returns the embedded bookmarks array.
   */
  async getProjectBookmarks(user: FirnUser): Promise<FirnProjectBookmark[]> {
    return user.projectBookmarks ?? []
  },

  /**
   * Add a project bookmark for a user.
   * Ensures idempotency by not adding duplicates for the same projectDocId.
   */
  async addProjectBookmark(user: FirnUser, project: FirnProjectBookmark): Promise<FirnUser | null> {
    const existingBookmarks = user.projectBookmarks ?? []
    const alreadyBookmarked = existingBookmarks.some(b => b.projectDocId === project.projectDocId)

    const projectBookmarks: FirnProjectBookmark[] = alreadyBookmarked
      ? existingBookmarks
      : [...existingBookmarks, project]

    const updates: Partial<FirnUser> = {
      projectBookmarks
    }

    const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
    return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
  },

  /**
   * Remove a project bookmark for a user.
   * Matches on projectDocId; no-op if the bookmark does not exist.
   */
  async removeProjectBookmark(user: FirnUser, project: FirnProjectBookmark): Promise<FirnUser | null> {
    const existingBookmarks = user.projectBookmarks ?? []
    const projectBookmarks: FirnProjectBookmark[] = existingBookmarks.filter(
      b => b.projectDocId !== project.projectDocId
    )

    const updates: Partial<FirnUser> = {
      projectBookmarks
    }

    const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
    return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
  },

  /*
   * TODO DOCUMENTS (user-linked)
   */

  /**
   * Create a TodoDocument with the given user as sole owner, and add the document reference to the user's todos.
   * Returns the created TodoDocument and the updated FirnUser, or null if creation failed.
   */
  async createTodoDocumentForUser(
    user: FirnUser,
    input: { title: string, description?: string }
  ): Promise<{ todoDocument: TodoDocument, user: FirnUser } | null> {
    const userRef = userToRef(user)
    const created = await ProductivityService.createTodoDocument({
      owners: [userRef],
      title: input.title,
      description: input.description
    })
    if (!created)
      return null
    const todoRef = todoDocToRef(created)
    const existingTodoDocuments = user.todoDocuments ?? []
    const alreadyIn = existingTodoDocuments.some(r => r.id === created._id)
    const todoDocuments = alreadyIn ? existingTodoDocuments : [...existingTodoDocuments, todoRef]
    const updates: Partial<FirnUser> = { todoDocuments }
    const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
    const updatedUser = { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
    return { todoDocument: created as TodoDocument, user: updatedUser }
  },

  /**
   * Delete a TodoDocument and remove its reference from the user's todoDocuments.
   * Returns the updated FirnUser.
   */
  async deleteTodoDocumentForUser(user: FirnUser, todoDocument: TodoDocument): Promise<FirnUser | null> {
    await ProductivityService.deleteTodoDocument(todoDocument)
    const existingTodoDocuments = user.todoDocuments ?? []
    const todoDocuments = existingTodoDocuments.filter(r => r.id !== todoDocument._id)
    const updates: Partial<FirnUser> = { todoDocuments }
    const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
    return { ...user, ...updates, _id: result.id, _rev: result.rev } as FirnUser
  },

  /**
   * Add a user as an additional owner or viewer of a TodoDocument.
   * Idempotent: if the user is already in that role, the document is unchanged.
   */
  async addUserAsOwnerOrViewer(
    user: FirnUser,
    todoDocument: TodoDocument,
    role: 'owner' | 'viewer'
  ): Promise<TodoDocument | null> {
    if (!todoDocument._id || !todoDocument._rev)
      return null
    const userRef = userToRef(user)
    const now = DateTime.now().toISO()
    if (role === 'owner') {
      const owners = todoDocument.owners ?? []
      if (owners.some(r => r.id === user._id))
        return todoDocument
      const updated: TodoDocument = {
        ...todoDocument,
        owners: [...owners, userRef],
        updatedAt: now
      }
      const result = await couchDB.updateDocument(todoDocument._id, updated, todoDocument._rev)
      return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
    }
    else {
      const viewers = todoDocument.viewers ?? []
      if (viewers.some(r => r.id === user._id))
        return todoDocument
      const updated: TodoDocument = {
        ...todoDocument,
        viewers: [...viewers, userRef],
        updatedAt: now
      }
      const result = await couchDB.updateDocument(todoDocument._id, updated, todoDocument._rev)
      return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
    }
  },

  /**
   * Remove a user as owner or viewer of a TodoDocument.
   * Note: Removing the last owner leaves the document with no owners; enforce policy in the caller if needed.
   */
  async removeUserAsOwnerOrViewer(
    user: FirnUser,
    todoDocument: TodoDocument,
    role: 'owner' | 'viewer'
  ): Promise<TodoDocument | null> {
    if (!todoDocument._id || !todoDocument._rev)
      return null
    const now = DateTime.now().toISO()
    if (role === 'owner') {
      const owners = (todoDocument.owners ?? []).filter(r => r.id !== user._id)
      const updated: TodoDocument = { ...todoDocument, owners, updatedAt: now }
      const result = await couchDB.updateDocument(todoDocument._id, updated, todoDocument._rev)
      return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
    }
    else {
      const viewers = (todoDocument.viewers ?? []).filter(r => r.id !== user._id)
      const updated: TodoDocument = { ...todoDocument, viewers, updatedAt: now }
      const result = await couchDB.updateDocument(todoDocument._id, updated, todoDocument._rev)
      return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
    }
  },

  /*
   * USER TYPE CONVERSION
   */

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
   * Convert a FirnUser to a DisplayUserToAdmin (also used for displaying comprehensive user information to self)
   */
  async convertToDisplayUserToAdmin(user: FirnUser): Promise<DisplayUserToAdmin> {
    const displayUser: DisplayUserToAdmin = {
      firnId: user.firnId,
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
    // Generate a unique firnId
    const { firnId } = await UserService.generateUniqueFirnIdAndGoogleId()

    // Create new user from GoogleUser with all required FirnUser fields
    const newFirnUser: Omit<FirnUser, '_id' | '_rev'>
      = {
        type: 'firnUser',
        schema: 1,
        firnId: firnId,
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
        // User-related arrays and collections
        permissions: [],
        tokens: [],
        projectBookmarks: [],
        todos: [],
        preferences: []
      }
    return newFirnUser as FirnUser
  }
}
