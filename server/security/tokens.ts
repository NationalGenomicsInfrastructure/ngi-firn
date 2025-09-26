import 'dotenv/config'
import type { H3Event } from 'h3'
import type { KeyObject } from 'crypto'
import type { FirnUser } from '../../types/auth'
import type { FirnJWTPayload, FirnUserToken } from '../../types/tokens'
import { couchDB } from '../database/couchdb'
import { DateTime } from 'luxon'

// generates a key that can be used for signing and verifying JWTs and encrypting and decrypting JWEs
import { createSecretKey, scryptSync } from 'crypto'

// uses the JSON Web Signature (JWS) specification to create a signature for the JWT using the previously generated symmetric key.
// provides a function to verify the signature of a JWT using the previously generated symmetric key.
import { jwtDecrypt, EncryptJWT } from 'jose'

/*
 * Token Handler - Table of Contents
 * *********************************
 *
 *
 * INCOMING REQUEST HANDLING:
 * extractTokenFromHeader(event) - Extract a token from a H3 server event if it exists - typically from an API request (REST / tRPC)
 *
 * VERIFY TOKENS:
 * verifyToken(token) - Verify the signature of a token
 * verifyTokenWithClaims(token, expectedAudience) - Verify the signature of a token with expected audience (we always verify the issuer)
 *
 * ISSUE TOKENS:
 * generateToken(userId, expiresAt) - Generate a token for the given user ID and expiration time
 * generateTokenWithClaims(userId, audience, expiresAt) - Generate a token for the given user ID and audience and expiration time
 */

export class TokenHandler {
  private issuer: string
  private secretKey: KeyObject

  constructor() {
    // derive a symmetric key from the session password
    if (!process.env.NUXT_SESSION_PASSWORD) {
      throw new Error('NUXT_SESSION_PASSWORD is not set in environment variables, cannot generate tokens')
    }
    if (!process.env.NUXT_SESSION_SALT) {
      throw new Error('NUXT_SESSION_SALT is not set in environment variables, cannot generate tokens')
    }
    this.secretKey = createSecretKey(scryptSync(process.env.NUXT_SESSION_PASSWORD, process.env.NUXT_SESSION_SALT, 32))
    this.issuer = `urn:${(process.env.NUXT_APP_URL ?? 'NGI-FIRN').toLowerCase().replace(/[^a-z0-9]/g, '')}`
    console.log('Tokens will be issued by:', this.issuer)
  }

  /*
     * Extract a token from a H3 server event if it exists - typically from an API request (REST / tRPC)
     */
  public async extractTokenFromHeader(event: H3Event): Promise<string | undefined> {
    const authHeader = getRequestHeader(event, 'authorization')
    if (authHeader) {
      const [method, token] = authHeader.split(' ')
      if (method.toLowerCase() === 'bearer' && token) {
        return token
      }
    }
  }

  public async verifyFirnUserToken(token: string, expectedAudience?: string): Promise<{ user: FirnUser | null, token: FirnUserToken | null, error?: string }> {
    let success: boolean = false
    let payload: FirnJWTPayload | undefined
    let error: string | undefined

    if (expectedAudience) {
      const result = await this.verifyTokenWithPublicClaims(token, expectedAudience)
      success = result.success
      payload = result.payload
      error = result.error
    }
    else {
      const result = await this.verifyToken(token)
      success = result.success
      payload = result.payload
      error = result.error
    }

    if (error) {
      return { user: null, token: null, error: error }
    }

    if (success && payload) {
      const user = await couchDB.getDocument<FirnUser>(payload.firnUser)
      if (user) {
        const userTokens = user.tokens as FirnUserToken[]
        const existingToken = userTokens.find(token => token.tokenID === payload.tokenID)
        if (existingToken) {
          return { user: user, token: existingToken }
        }
        else {
          return { user: null, token: null, error: 'Token ID not found in user tokens' }
        }
      }
      else {
        return { user: null, token: null, error: 'User not found' }
      }
    }
    else {
      return { user: null, token: null, error: 'Token verification failed' }
    }
  }

  private async verifyToken(token: string): Promise<{ success: boolean, payload?: FirnJWTPayload, error?: string }> {
    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: this.issuer
      })
      return { success: true, payload: payload as FirnJWTPayload }
    }
    catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  private async verifyTokenWithPublicClaims(token: string, expectedAudience: string): Promise<{ success: boolean, payload?: FirnJWTPayload, error?: string }> {
    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: this.issuer,
        audience: `urn:${expectedAudience}`
      })
      return { success: true, payload: payload as FirnJWTPayload }
    }
    catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  // generate a JWT for the given audience and expiration time
  private async generateTokenWithPublicClaims(payload: FirnJWTPayload, audience?: string, expiresAt?: string): Promise<string> {
    let token: string
    const audienceClaim = audience ? audience.toLowerCase().replace(/[^a-z0-9]/g, '') : ''

    // optionally a token without any specific audience to allow requesting any resource can be created
    if (audience == '') {
      token = await new EncryptJWT(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setIssuer(this.issuer)
        .setExpirationTime(expiresAt ? DateTime.fromISO(expiresAt).toUnixInteger() : DateTime.now().plus({ days: 7 }).toUnixInteger())
        .encrypt(this.secretKey)
    }
    else {
      token = await new EncryptJWT(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setIssuer(this.issuer)
        .setAudience(`urn:${audienceClaim}`)
        .setExpirationTime(expiresAt ? DateTime.fromISO(expiresAt).toUnixInteger() : DateTime.now().plus({ days: 7 }).toUnixInteger())
        .encrypt(this.secretKey)
    }
    return token
  }

  public async generateFirnUserToken(user: FirnUser, audience?: string, expiresAt?: string): Promise<{ jwt: string, user: FirnUser } | null> {
    // retrieve existing user tokens
    const userTokens = user.tokens as FirnUserToken[]

    // get a unique token ID for that user
    // while loop continues until a unique token ID is found by randomly generating a string and checking if it is already in the user tokens
    let newTokenID: string
    do {
      newTokenID = Math.random().toString(36).substring(3, 10)
    } while (userTokens.some(token => token.tokenID === newTokenID))

    // generate new token payload
    const payload: FirnJWTPayload = {
      tokenID: newTokenID,
      firnUser: user._id
    }

    // default to one week
    if (!expiresAt) {
      expiresAt = DateTime.now().plus({ days: 7 }).toISO()
    }

    // no specific audience given
    if (!audience) {
      audience = ''
    }

    const newToken: FirnUserToken = {
      type: 'firn-token',
      schema: 1,
      tokenID: payload.tokenID,
      audience: audience,
      expiresAt: expiresAt,
      lastUsedAt: DateTime.now().toISO(),
      createdAt: DateTime.now().toISO()
    }

    // update the user tokens with the new token
    const updatedUserTokens = userTokens.concat([newToken])
    const updatedUser: Partial<FirnUser> = {
      tokens: updatedUserTokens
    }

    const jwt = await this.generateTokenWithPublicClaims(payload, audience, expiresAt)

    if (user && jwt) {
      // Update the user
      const result = await couchDB.updateDocument(user._id, { ...user, ...updatedUser }, user._rev!)
      if (result) {
        return { jwt, user: { ...user, ...updatedUser, _id: result.id, _rev: result.rev } as FirnUser }
      }
    }
    return null
  }

  public async deleteFirnUserToken(user: FirnUser, tokenID: string[]): Promise<FirnUser | null> {
    // retrieve existing user tokens
    const userTokens = user.tokens as FirnUserToken[]

    // Filter out tokens that match the provided IDs
    const updatedTokens = userTokens.filter(token => !tokenID.includes(token.tokenID))

    const updatedUser: Partial<FirnUser> = {
      tokens: updatedTokens
    }

    const result = await couchDB.updateDocument(user._id, { ...user, ...updatedUser }, user._rev!)
    if (result) {
      return { ...user, ...updatedUser, _id: result.id, _rev: result.rev } as FirnUser
    }

    return null
  }
}

// Export a singleton instance with default configuration
export const tokenHandler = new TokenHandler()
