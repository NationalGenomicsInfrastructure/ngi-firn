import type { SessionUser, SessionUserSecure, FirnUser } from './auth'

interface Context {
  user?: SessionUser
  secure?: SessionUserSecure
  token?: string
  firnUser?: FirnUser
}
