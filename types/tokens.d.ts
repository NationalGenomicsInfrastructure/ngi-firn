import type * as jose from 'jose'
import type { BaseDocument } from '../server/database/couchdb'

// By default, the actual token is not stored, just an ID and a timestamp for expiration

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

// Normally, generated tokens are ephemeral, but optional barcode login is a requirement 
// and the tokens are too long for encoding them in a barcode.
// Therefore, we allow them to be stored in the database, encrypted with a user-specific key
// which is derived from an ephemeral string that we encode in the barcode instead.
export interface EncryptedFirnUserToken {
  type: 'encrypted-firn-token'
  schema: 1
  userID: string
  tokenID: string
  encryptedToken: string
}