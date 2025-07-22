import { createTRPCNuxtHandler } from 'trpc-nuxt/server'
import { createTRPCContext } from '../../trpc/init'
import { firnRouter } from '../../trpc/routers/index'

export default createTRPCNuxtHandler({
  endpoint: '/api/trpc',
  router: firnRouter,
  createContext: createTRPCContext
})
