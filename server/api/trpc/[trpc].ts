import { createTRPCNuxtHandler } from 'trpc-nuxt/server'
import { createTRPCContext } from '../../trpc/init'
import { firnRouter } from '../../trpc/routers/index'

export default createTRPCNuxtHandler({
  endpoint: '/api/trpc',
  router: firnRouter,
  // trpc-nuxt v2.1.2 bundles its own (h3 v2) H3Event type declaration, whereas
  // createTRPCContext, getUserSession and the token handler operate on h3 v1's
  // H3Event. The runtime event object is identical; only the shipped type
  // declarations diverge, so we cast to the handler's expected createContext type.
  createContext: createTRPCContext as unknown as NonNullable<Parameters<typeof createTRPCNuxtHandler>[0]['createContext']>
})
