import { createTRPCClient, httpLink } from '@trpc/client'
import type { FirnRouter } from '../../../server/trpc/routers'

export async function loginWithToken(origin: string, token: string, expectedUser: { firnId: string, email: string }) {
  const response = await fetch(`${origin}/api/auth/token?redirectUrl=/scan`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}` }
  })
  // The production endpoint returns 201 on success and also sets cookies on rejection.
  if (response.status !== 201 || response.headers.get('location') !== '/scan') {
    throw new Error(`Bombadil token login rejected (HTTP ${response.status}).`)
  }
  const pairs = response.headers.getSetCookie()
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter((pair): pair is string => Boolean(pair && pair.includes('=')))
  if (!pairs.length) throw new Error('Token login returned no session cookie.')

  const client = createTRPCClient<FirnRouter>({
    links: [httpLink({
      url: `${origin}/api/trpc`,
      headers: { Cookie: pairs.join('; ') },
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
    })]
  })
  const user = await client.users.getUserInfoSelf.query()
  if (user.firnId !== expectedUser.firnId || user.googleEmail !== expectedUser.email) {
    throw new Error('Authenticated session does not belong to the Bombadil fixture user.')
  }
  return pairs
}
