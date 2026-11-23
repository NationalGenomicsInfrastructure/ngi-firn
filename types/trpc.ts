import type { SessionUser, SessionUserSecure, FirnUser } from './auth'

export interface Context {
  user?: SessionUser
  secure?: SessionUserSecure
  token?: string
  firnUser?: FirnUser
}
