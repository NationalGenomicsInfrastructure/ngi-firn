import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { usersRouter } from './users'

export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(
      z.object({
        text: z.string()
      })
    )
    .query((opts) => {
      return {
        greeting: `Reply via tRPC: ${opts.input.text}`
      }
    }),
  users: usersRouter
})

// export type definition of API
export type AppRouter = typeof appRouter
