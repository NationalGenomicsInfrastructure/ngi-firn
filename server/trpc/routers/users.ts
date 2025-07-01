import { z } from 'zod'
import { baseProcedure, createTRPCRouter, adminProcedure, approvedProcedure, authedProcedure } from '../init'
import { couchDB } from '../../database/couchdb'
import type { User } from '../../../types/auth'

// Input schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  avatar: z.string().url().optional(),
  provider: z.enum(['google', 'github']),
  providerId: z.string(),
  isAdmin: z.boolean().default(false)
})

const approveUserSchema = z.object({
  userId: z.string(),
  approved: z.boolean()
})

const linkProviderSchema = z.object({
  provider: z.enum(['github']),
  providerId: z.string(),
  name: z.string().optional(),
  avatar: z.string().url().optional(),
  url: z.string().url().optional()
})

const updateUserSchema = z.object({
  userId: z.string(),
  name: z.string().optional(),
  avatar: z.string().url().optional(),
  isAdmin: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  settings: z.record(z.string()).optional(),
  preferences: z.record(z.string()).optional()
})

export const usersRouter = createTRPCRouter({
  // Create a new user (admin only)
  create: adminProcedure
    .input(createUserSchema)
    .mutation(async ({ input }) => {
      const existingUser = await couchDB.queryDocuments<User>({
        type: 'user',
        email: input.email
      })

      if (existingUser.length > 0) {
        throw new Error('User with this email already exists')
      }

      const user: Omit<User, '_id' | '_rev'> = {
        type: 'user',
        provider: input.provider,
        name: input.name,
        avatar: input.avatar || '',
        email: input.email,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isAdmin: input.isAdmin,
        permissions: input.isAdmin ? ['admin'] : [],
        tokens: [],
        sessions: [],
        todos: [],
        settings: {},
        preferences: {}
      }

      const result = await couchDB.createDocument(user)
      return { id: result.id, ...user }
    }),

  // Approve or reject a user (admin only)
  approve: adminProcedure
    .input(approveUserSchema)
    .mutation(async ({ input }) => {
      const user = await couchDB.getDocument<User>(input.userId)
      if (!user) {
        throw new Error('User not found')
      }

      if (input.approved) {
        user.permissions = [...user.permissions, 'approved']
      } else {
        user.permissions = user.permissions.filter((p: string) => p !== 'approved')
      }

      user.updatedAt = new Date().toISOString()
      const result = await couchDB.updateDocument(input.userId, user, user._rev!)
      return { id: result.id, approved: input.approved }
    }),

  // Get all users (admin only)
  list: adminProcedure
    .input(z.object({
      includePending: z.boolean().default(true),
      includeApproved: z.boolean().default(true)
    }).optional())
    .query(async ({ input = { includePending: true, includeApproved: true } }) => {
      const users = await couchDB.queryDocuments<User>({
        type: 'user'
      })

      return users.filter(user => {
        const isApproved = user.permissions.includes('approved')
        return (input.includeApproved && isApproved) || 
              (input.includePending && !isApproved)
      })
    }),

  // Get user by ID (approved users can access)
  getById: approvedProcedure
    .input(z.string())
    .query(async ({ input }) => {
      const user = await couchDB.getDocument<User>(input)
      if (!user) {
        throw new Error('User not found')
      }
      return user
    }),

  // Get user by email (admin only)
  getByEmail: adminProcedure
    .input(z.string().email())
    .query(async ({ input }) => {
      const users = await couchDB.queryDocuments<User>({
        type: 'user',
        email: input
      })
      return users[0] || null
    }),

  // Get user by provider ID (admin only)
  getByProviderId: adminProcedure
    .input(z.object({
      provider: z.enum(['google', 'github']),
      providerId: z.string()
    }))
    .query(async ({ input }) => {
      const users = await couchDB.queryDocuments<User>({
        type: 'user',
        [`${input.provider}Id`]: input.providerId
      })
      return users[0] || null
    }),

  // Update user (admin only)
  update: adminProcedure
    .input(updateUserSchema)
    .mutation(async ({ input }) => {
      const user = await couchDB.getDocument<User>(input.userId)
      if (!user) {
        throw new Error('User not found')
      }

      const updates: Partial<User> = {
        updatedAt: new Date().toISOString()
      }

      if (input.name !== undefined) updates.name = input.name
      if (input.avatar !== undefined) updates.avatar = input.avatar
      if (input.isAdmin !== undefined) {
        updates.isAdmin = input.isAdmin
        if (input.isAdmin && !user.permissions.includes('admin')) {
          updates.permissions = [...user.permissions, 'admin']
        } else if (!input.isAdmin) {
          updates.permissions = user.permissions.filter((p: string) => p !== 'admin')
        }
      }
      if (input.permissions !== undefined) updates.permissions = input.permissions
      if (input.settings !== undefined) updates.settings = input.settings
      if (input.preferences !== undefined) updates.preferences = input.preferences

      const result = await couchDB.updateDocument(input.userId, { ...user, ...updates }, user._rev!)
      return { id: result.id, ...updates }
    }),

  // Delete user (admin only)
  delete: adminProcedure
    .input(z.string())
    .mutation(async ({ input }) => {
      const user = await couchDB.getDocument<User>(input)
      if (!user) {
        throw new Error('User not found')
      }

      await couchDB.deleteDocument(input, user._rev!)
      return { id: input, deleted: true }
    }),

  // Link secondary provider (GitHub) to existing user
  linkProvider: approvedProcedure
    .input(linkProviderSchema)
    .mutation(async ({ input, ctx }) => {
      const user = await couchDB.getDocument<User>(ctx.user.id)
      if (!user) {
        throw new Error('User not found')
      }

      // Check if this GitHub account is already linked to another user
      const existingUser = await couchDB.queryDocuments<User>({
        type: 'user',
        githubId: input.providerId
      })

      if (existingUser.length > 0 && existingUser[0]._id !== user._id) {
        throw new Error('This GitHub account is already linked to another user')
      }

      // Update user with GitHub information
      const updates: Partial<User> = {
        githubId: input.providerId,
        githubName: input.name,
        githubAvatar: input.avatar,
        githubUrl: input.url,
        updatedAt: new Date().toISOString()
      }

      const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
      return { id: result.id, linked: true }
    }),

  // Get pending users (admin only)
  getPending: adminProcedure
    .query(async () => {
      const users = await couchDB.queryDocuments<User>({
        type: 'user'
      })

      return users.filter(user => !user.permissions.includes('approved'))
    }),

  // Get approved users (admin only)
  getApproved: adminProcedure
    .query(async () => {
      const users = await couchDB.queryDocuments<User>({
        type: 'user'
      })

      return users.filter(user => user.permissions.includes('approved'))
    }),

  // Get current user profile (authenticated users)
  getProfile: authedProcedure
    .query(async ({ ctx }) => {
      const user = await couchDB.getDocument<User>(ctx.user.id)
      if (!user) {
        throw new Error('User not found')
      }
      return user
    }),

  // Update current user profile (authenticated users)
  updateProfile: authedProcedure
    .input(z.object({
      name: z.string().optional(),
      avatar: z.string().url().optional(),
      settings: z.record(z.string()).optional(),
      preferences: z.record(z.string()).optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await couchDB.getDocument<User>(ctx.user.id)
      if (!user) {
        throw new Error('User not found')
      }

      const updates: Partial<User> = {
        updatedAt: new Date().toISOString()
      }

      if (input.name !== undefined) updates.name = input.name
      if (input.avatar !== undefined) updates.avatar = input.avatar
      if (input.settings !== undefined) updates.settings = input.settings
      if (input.preferences !== undefined) updates.preferences = input.preferences

      const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
      return { id: result.id, ...updates }
    }),

  // Login with OAuth provider (public endpoint)
  login: baseProcedure
    .input(z.object({
      provider: z.enum(['google', 'github']),
      providerId: z.string(),
      name: z.string(),
      email: z.string().email(),
      avatar: z.string().url().optional(),
      url: z.string().url().optional()
    }))
    .mutation(async ({ input }) => {
      // Check if user exists by provider ID
      const existingUser = await UserService.getUserByProviderId(input.provider, input.providerId)
      
      if (!existingUser) {
        throw new Error('User not found')
      }

      // Check if user is approved
      const isApproved = await UserService.isUserApproved(existingUser._id)
      
      if (!isApproved) {
        throw new Error('User not approved')
      }

      // Update last seen and provider-specific fields
      const updates: Partial<User> = {
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (input.provider === 'google') {
        updates.googleId = input.providerId
        updates.name = input.name
        updates.avatar = input.avatar
      } else if (input.provider === 'github') {
        updates.githubId = input.providerId
        updates.githubName = input.name
        updates.githubAvatar = input.avatar
        updates.githubUrl = input.url
      }

      await couchDB.updateDocument(existingUser._id, { ...existingUser, ...updates }, existingUser._rev!)

      return {
        success: true,
        user: {
          id: existingUser._id,
          name: existingUser.name,
          avatar: existingUser.avatar,
          email: existingUser.email,
          provider: input.provider
        }
      }
    }),

  // Register new user with Google OAuth (public endpoint)
  register: baseProcedure
    .input(z.object({
      provider: z.enum(['google']),
      providerId: z.string(),
      name: z.string(),
      email: z.string().email(),
      avatar: z.string().url().optional()
    }))
    .mutation(async ({ input }) => {
      // Check if user already exists by email
      const existingUser = await UserService.getUserByEmail(input.email)
      
      if (existingUser) {
        throw new Error('User with this email already exists')
      }

      // Create new user (unapproved by default)
      const newUser: Omit<User, '_id' | '_rev'> = {
        type: 'user',
        provider: input.provider,
        name: input.name,
        avatar: input.avatar || '',
        email: input.email,
        emailVerified: true, // Google emails are verified
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isAdmin: false,
        permissions: [], // New users are not approved by default
        tokens: [],
        sessions: [],
        todos: [],
        settings: {},
        preferences: {},
        googleId: input.providerId
      }

      const result = await couchDB.createDocument(newUser)
      
      return {
        success: true,
        user: {
          id: result.id,
          name: newUser.name,
          email: newUser.email,
          avatar: newUser.avatar,
          provider: input.provider
        }
      }
    }),

  // Link GitHub to existing user (public endpoint)
  linkGitHub: baseProcedure
    .input(z.object({
      userId: z.string(),
      providerId: z.string(),
      name: z.string(),
      avatar: z.string().url().optional(),
      url: z.string().url().optional()
    }))
    .mutation(async ({ input }) => {
      const user = await couchDB.getDocument<User>(input.userId)
      if (!user) {
        throw new Error('User not found')
      }

      // Check if this GitHub account is already linked to another user
      const existingUser = await couchDB.queryDocuments<User>({
        type: 'user',
        githubId: input.providerId
      })

      if (existingUser.length > 0 && existingUser[0]._id !== user._id) {
        throw new Error('This GitHub account is already linked to another user')
      }

      // Update user with GitHub information
      const updates: Partial<User> = {
        githubId: input.providerId,
        githubName: input.name,
        githubAvatar: input.avatar,
        githubUrl: input.url,
        updatedAt: new Date().toISOString()
      }

      const result = await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
      
      return {
        success: true,
        user: {
          id: result.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          githubLinked: true
        }
      }
    })
}) 