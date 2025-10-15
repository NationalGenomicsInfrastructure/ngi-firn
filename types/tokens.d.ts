import type * as jose from 'jose'
// The actual token is not stored, just an ID and a timestamp for expiration

export interface FirnUserToken {
  type: 'firn-token'
  schema: 1
  tokenID: string
  audience: string | null
  expiresAt: string
  createdAt: string
  lastUsedAt: string
}

export interface FirnJWTPayload extends jose.JWTPayload {
  tid: string
  udoc: string
}
