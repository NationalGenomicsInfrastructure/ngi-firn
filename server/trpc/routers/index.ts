import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { usersRouter } from './users'
import { tokensRouter } from './tokens'

export const firnRouter = createTRPCRouter({
  // test endpoint for tRPC
  hello: baseProcedure
    .input(
      z.object({
        text: z.string()
      })
    )
    .query((opts) => {
      return {
        greeting: `Hello ${opts.input.text}!`
      }
    }),
  users: usersRouter,
  tokens: tokensRouter
})

// export type definition of API
export type FirnRouter = typeof firnRouter
