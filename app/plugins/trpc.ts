import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client'
import type { FirnRouter } from '../../server/trpc/routers/index'

export default defineNuxtPlugin(() => {
  const trpc = createTRPCNuxtClient<FirnRouter>({
    links: [httpBatchLink({ url: '/api/trpc' })]
  })

  return {
    provide: {
      trpc
    }
  }
})
