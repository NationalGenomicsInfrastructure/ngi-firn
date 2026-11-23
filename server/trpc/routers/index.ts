import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { usersRouter } from './users'
import { tokensRouter } from './tokens'
import { projectsRouter } from './projects'
import { inventoryRouter } from './inventory'
import { tasksRouter } from './tasks'

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
  tokens: tokensRouter,
  projects: projectsRouter,
  inventory: inventoryRouter,
  tasks: tasksRouter
})

// export type definition of API
export type FirnRouter = typeof firnRouter
