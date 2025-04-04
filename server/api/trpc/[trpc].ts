import { createTRPCNuxtHandler } from 'trpc-nuxt/server'
import { createTRPCContext } from '~/server/trpc/init'
import { appRouter } from '~/server/trpc/routers/init'

export default createTRPCNuxtHandler({
  endpoint: '/api/trpc',
  router: appRouter,
  createContext: createTRPCContext,
})