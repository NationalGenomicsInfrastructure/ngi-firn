import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { usersRouter } from './users'

export const firnRouter = createTRPCRouter({
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
  users: usersRouter
})

// export type definition of API
export type FirnRouter = typeof firnRouter
