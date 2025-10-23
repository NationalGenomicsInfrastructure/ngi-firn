# Token authentication in Firn

## Overview

In addition to the OAuth, which should be the primary access method using personal computers, Firn allows authentication with tokens. This custom method was implemented for convenience when working in the lab and having to use Firn from shared tablets and computers with external barcode readers instead of keyboards.

The Firn application can issue user‑scoped tokens with a maximum validity of up to one year, that can be presented via QR code or 1D barcode for login.

## Token type

At the technical level, Firn tokens are JSON Web Tokens (JWTs) encrypted using JWE (JSON Web Encryption). The server decrypts and validates claims, then maps the token to a user and updates metadata such as last usage.

JWT, JWS, and JWE in brief:

- **JWT (JSON Web Token)**: A compact container for claims (e.g., `iss`, `aud`, `exp`), independent of how it is protected.
- **JWS (JSON Web Signature)**: A JWT that is signed for integrity and authenticity. Anyone with the public key can verify; the payload is not confidential.
- **JWE (JSON Web Encryption)**: A JWT that is encrypted for confidentiality (and integrity). Only parties with the decryption key can read the claims.

Inside the token's container, Firn embeds two claims: The database document ID of the relevant FirnUser document (`udoc`) and a short tokenID (`tid`). Due to carrying an ID claim, tokens can be revoked before their expiration date, if they have been compromised or a print went missing.

```ts
export interface FirnJWTPayload extends jose.JWTPayload {
  tid: string
  udoc: string
}
```

In addition to those custom claims, the JWT standard fields **expiration** (`exp`), **issuer (`iss`)** and optionally **audience** (`aud`) are used. The expiration is set to a user-defined date in the future, but restricted to a maximum of one year. The issuer field contains the `urn:${(NUXT_APP_URL)}` lowercased and stripped to alphanumeric. When provided, the audience string is normalized to `urn:${audience}` where `audience` is lowercased and non‑alphanumeric characters are removed.

Because Firn embeds the sensitive ID of the database document that stores the associated user, Firn uses JWEs instead of JWS: Tokens are encrypted and then decrypted server‑side during authentication.

## Token delivery methods: 1D barcode-suitable vs QR code

Both methods ultimately validate the same kind of JWE token; they differ in how the token material is transported and stored.

JWEs are confidential and safe, but also between 200 and 300 characters long, far exceeding the capacity of any 1D barcode standard. Code 128, the standard that we use for our plate barcodes can theoretically encode up to 50 characters and digits, but our Zebra label printer only fits barcodes with less than 21 characters on the label. For reliable reading, it must be even less than that: 16.

This space restriction precludes us from encoding the actual token in a 1D barcode. Instead, we encode the decryption key in the barcode and store the actual token in the database. Because the system does neither store the key nor is able to derive it, the token cannot be validated without the information contained in the barcode.

### QR code tokens

- The server returns the actual JWE string to the client, it is ephemeral.
- The client can encode this JWE into a QR code (high capacity) and present it at login.
- The server decrypts the JWE using a global symmetric key and validates issuer, optional audience, and expiry.
- Nothing beyond metadata is stored in the database (i.e., `encryptedToken` remains `null`).

Issuance path for QR:

```247:259:server/security/tokens.ts
    if (tokenType === 'barcode') {
      // ...
    } else {
      // For QR codes, we can use the JWT directly
      jwt = await this.generateTokenWithPublicClaims(payload, audience, expiresAt, undefined)
    }
```

QR code tokens are **specifically suitable for scanning by camera**. They should be used on devices such as mobiles or tablets.

### Barcode tokens

- 1D barcodes cannot fit a full JWE, so Firn stores the JWE encrypted in the database and encodes only a compact reference in the barcode.
- The barcode’s value format is: `ft` + `firnId` (4 chars) + `tokenID` (4 chars) + `randomString` (6 hex), e.g., `ftabcdwxyz12af34`.
- The server recreates the per‑token key using `tokenID + randomString`, fetches the encrypted token from the user record, and decrypts it.

Issuance path for barcode:

```245:256:server/security/tokens.ts
    if (tokenType === 'barcode') {
      // Use a cryptographically secure random string generator via randomBytes.
      const randomString = randomBytes(3).toString('hex')
      const customKey = await this.generateCustomKey(newTokenID + randomString)
      jwt = await this.generateTokenWithPublicClaims(payload, audience, expiresAt, customKey)
      const barcodeString = 'ft' + user.firnId + newTokenID + randomString // "ft" for "Firn Token"
      // Store the actual JWT in the database, return the barcode string instead
      newToken.encryptedToken = jwt
      jwt = barcodeString
    }
```

Validation of a barcode token (recognition, key reconstruction, DB lookup):

```84:105:server/security/tokens.ts
    let customKey: KeyObject | undefined
    if (token.startsWith('ft')) {
      const barcode = token.split('ft')[1]
      // the FirnID is generated by Math.random().toString(36).substring(3, 7)
      // so it is always 4 characters long
      const firnId = barcode.substring(0, 4)
      const tokenID = barcode.substring(4, 8)
      const randomString = barcode.substring(8)
      customKey = await this.generateCustomKey(tokenID + randomString)
      const barcodeUser = await UserService.matchFirnUserByFirnQuery({ firnId: firnId })
      if (!barcodeUser) {
        return { user: null, token: null, error: 'Invalid barcode token' }
      }
      const barcodeUserTokens = barcodeUser.tokens as FirnUserToken[]
      const existingToken = barcodeUserTokens.find(token => token.tokenID === tokenID)?.encryptedToken?.toString() ?? ''
      // If there is no encrypted token found or the custom key was not generated, return an error
      if (!existingToken && !customKey) {
        return { user: null, token: null, error: 'Invalid barcode token' }
      } else {
        token = existingToken
      }
    }
```

Barcode code tokens are **specifically suitable for external linear barcode readers**. They should be used computers with external barcode readers, since the orientation and full length of a linear barcode is difficult to determine for a 2D visual reader such as a camera.

## Token generation

The JWE is produced and consumed using the [`jose`](https://medium.com/@hasindusithmin64/creating-and-verifying-jwts-using-npm-jose-a-step-by-step-guide-e07c4fdb3346) library:

```server/security/tokens.ts
  private async generateTokenWithPublicClaims(payload: FirnJWTPayload, audience?: string, expiresAt?: string, customKey?: KeyObject): Promise<string> {
    let token: string
    const audienceClaim = audience ? audience.toLowerCase().replace(/[^a-z0-9]/g, '') : ''

    // optionally a token without any specific audience to allow requesting any resource can be created
    if (audience == '') {
      token = await new EncryptJWT(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setIssuer(this.issuer)
        .setExpirationTime(expiresAt ? DateTime.fromISO(expiresAt).toUnixInteger() : DateTime.now().plus({ days: 7 }).toUnixInteger())
        .encrypt(customKey ?? this.secretKey)
    }
    else {
      token = await new EncryptJWT(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setIssuer(this.issuer)
        .setAudience(`urn:${audienceClaim}`)
        .setExpirationTime(expiresAt ? DateTime.fromISO(expiresAt).toUnixInteger() : DateTime.now().plus({ days: 7 }).toUnixInteger())
        .encrypt(customKey ?? this.secretKey)
    }
    return token
  }
```

### Encryption and key derivation

To protect the JWT content, its payload is symmetrically encrypted using the `A256GCM` (AES‑256‑GCM) algorithm with a 32-byte key.

Which key is used for encryption and decryption depends on the type of token that is generated. For standard tokens, which are ephemeral and represented as QR code, a **global symmetric key** is used. This is a 32 byte key derived with `scryptSync` from the environment variables `NUXT_SESSION_PASSWORD` and `NUXT_SESSION_SALT` and then wrapped with `createSecretKey`.

In _barcode mode_, each token is encrypted with an individual key. This **per‑token symmetric key** is derived with `scryptSync` using `tokenID + randomString` as the password and the `NUXT_SESSION_SALT` environmental variable and in compliance with [NIST's recommendation for password-based key
derivation](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf). Instead of a user password, a combination of the token ID and a random 6‑hex‑character secret generated with `randomBytes(3)` is used.

```41:52:server/security/tokens.ts
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
```

```67:72:server/security/tokens.ts
  public async generateCustomKey(keySource: string): Promise<KeyObject> {
    if (!process.env.NUXT_SESSION_SALT) {
      throw new Error('NUXT_SESSION_SALT is not set in environment variables, cannot generate keys')
    }
    return createSecretKey(scryptSync(keySource, process.env.NUXT_SESSION_SALT, 32))
  }
```

## Token metadata

For each token, Firn stores a record in the user's document holding some metadata. This record may also persist the encrypted token itself, if a 1D barcode representation was chosen and the key is ephemeral.

```11:20:types/tokens.d.ts
export interface FirnUserToken {
  type: 'firn-token'
  schema: 1
  tokenID: string
  audience: string | null
  expiresAt: string
  createdAt: string
  lastUsedAt: string
  encryptedToken: string | null
}
```

On every successful validation, `lastUsedAt` is updated. This allows users and administrators to scrutinize the last successful authentication with that particular token and identify inactive or misused tokens.

## Validation, audience enforcement, and login

- General validation decrypts the token with either the per‑token key (barcode flow) or the global key (QR flow), then optionally checks `aud` against an expected audience.
- When a specific audience is required, the expected audience is normalized and compared to `urn:${expected}`.

```109:121:server/security/tokens.ts
    const audienceClaim = expectedAudience ? expectedAudience.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    const result = await this.verifyToken(token, customKey)
    // ...
    if (audienceClaim && payload?.aud !== `urn:${audienceClaim}`) {
      return { user: null, token: null, error: 'Token audience does not match expected audience' }
    }
```

For user login, the HTTP endpoint `/auth/token` enforces audience `User Login` and establishes a session on success:

```6:13:server/api/auth/token.post.ts
export default defineEventHandler(async (event: H3Event) => {
  // retrieve the token from the authorization header
  const token = await tokenHandler.extractTokenFromHeader(event)

  if (token && token.length > 0) {
    // check that it is a valid user token (aka general auth token)
    const result = await tokenHandler.verifyFirnUserToken(token, 'User Login')
```

On success, the endpoint converts the user to a session user and redirects to the provided `redirectUrl` (default `/firn`). On failure, it clears any session state and redirects to `/` with an appropriate status code.

## Token lifecycle operations (tRPC)

Various tRPC endpoints are defined in `server/trpc/routers/tokens.ts` to perform administrative actions and manage a user's own tokens.

- **Generate** (`tokens.generateFirnUserToken`): An authenticated user can request a new token as QR or barcode with optional audience and expiry (default 7 days). Returns the token string and updates the user’s token list.
- **Validate** (`tokens.validateFirnUserToken`): For an authenticated session, this endpoint returns the token metadata if the token validates. This is useful for self‑checking a token’s expiry and audience.
- **Delete (self)** (`tokens.deleteFirnUserToken`): Authenticated user deletes one or more of their tokens.
- **Delete (admin)** (`tokens.deleteUserTokenByAdmin`): An admin deletes tokens for a specified user.

## Security notes and trade‑offs

- JWE protects token confidentiality at rest and in transit; only the server (or a party with the symmetric key) can read claims.
- The global key is derived from environment secrets; rotate by changing `NUXT_SESSION_PASSWORD`/`NUXT_SESSION_SALT` (existing tokens become invalid).
- Barcode mode minimizes barcode length by storing the JWE in the DB and encoding only the derivation inputs; losing a barcode exposes only the ability to derive the per‑token key necessary to decrypt the stored JWE, which is intended. No other tokens are compromised by a lost barcode token.
- Audience scoping is optional at issuance but enforced when an endpoint supplies an expected audience (e.g., user login requires `User Login`).

## Client usage summary

- The QR flow reads and submits the JWE string.
- The barcode flow reads and submits the compact `ft...` token pointer.
- The login dialog posts `Authorization: Bearer <token>` to `/api/auth/token?redirectUrl=/firn`, establishes a session and navigates on success.
