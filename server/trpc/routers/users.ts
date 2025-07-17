import { z } from 'zod'
import { baseProcedure, createTRPCRouter, adminProcedure, authedProcedure, firnUserProcedure } from '../init'
import { UserService } from '../../crud/users'

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

