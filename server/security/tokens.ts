import 'dotenv/config'
import type { H3Event } from 'h3'

// generates a symmetric key that can be used for signing and verifying JWTs.
const { createSecretKey } = require('crypto');

// uses the JSON Web Signature (JWS) specification to create a signature for the JWT using the previously generated symmetric key.
const { SignJWT } = require('jose-node-cjs-runtime/jwt/sign');

// provides a function to verify the signature of a JWT using the previously generated symmetric key.
const { jwtVerify } = require('jose-node-cjs-runtime/jwt/verify');


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
 */

export class TokenHandler {
    private issuer: string
    private secretKey: Uint8Array

    constructor() {
        // derive a symmetric key from the session password
        this.secretKey = createSecretKey(process.env.NUXT_SESSION_PASSWORD, 'utf-8');
        this.issuer = process.env.NUXT_APP_URL || 'NGI-FIRN'
    }

    /*
     * Extract a token from a H3 server event if it exists - typically from an API request (REST / tRPC)
     */
    async extractTokenFromHeader(event: H3Event): Promise<string | undefined> {
        const authHeader = getRequestHeader(event, 'authorization');
        if (authHeader) {
            const [method, token] = authHeader.split(' ');
            if (method.toLowerCase() === 'bearer' && token) {
            return token;
            }
        }
    }

    async verifyToken(token: string): Promise<{ success: boolean; payload?: any; error?: string }> {
        try {
            const { payload } = await jwtVerify(token, this.secretKey, {
            issuer: this.issuer,
            algorithms: ['HS256']
            });
            return { success: true, payload };
        } catch (error: unknown) {
            return { success: false, error: (error as Error).message };
        }
    }
    
    async verifyTokenWithPublicClaims(token: string, expectedAudience: string): Promise<{ success: boolean; payload?: any; error?: string }> {
        try {
            const { payload } = await jwtVerify(token, this.secretKey, {
            issuer: this.issuer,
            audience: expectedAudience,
            algorithms: ['HS256']
            });
            return { success: true, payload };
        } catch (error: unknown) {
            return { success: false, error: (error as Error).message };
        }
    }

    // generate a JWT for the given user ID and expiration time
    async generateTokenWithPublicClaims(payload: any, audience: string, expiresAt?: string): Promise<string> {
        const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(this.issuer)
        .setAudience(audience)
        .setExpirationTime(expiresAt)
        .sign(this.secretKey);
        return token;
        }
}

// Export a singleton instance with default configuration
export const tokenHandler = new TokenHandler();


