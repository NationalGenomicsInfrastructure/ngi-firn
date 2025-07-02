import { UserService } from '../../utils/users'
import type { GoogleUser, FirnUser } from '../../../types/auth'

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {

    /** user object example:
    * sub: '[[:digits:]]+',
    * name: '[[:letters:]]+',
    * given_name: '[[:letters:]]+',
    * family_name: '[[:letters:]]+',
    * picture: 'URL',
    * email: 'email',
    * email_verified: Boolean,
    * hd: 'domain'
    */

    // only allow users from scilifelab.se to sign in
    if (user.hd !== 'scilifelab.se') {
      return sendRedirect(event, '/auth-error', 401)
    }

    const googleUser: GoogleUser = {
      provider: 'google',
      googleId: user.sub,
      googleName: user.name,
      googleGivenName: user.given_name,
      googleFamilyName: user.family_name,
      googleAvatar: user.picture,
      googleEmail: user.email,
      googleEmailVerified: user.email_verified
    }

    try {

      // Search for user in database
      const firnUser = await UserService.matchGoogleUser(googleUser)
      
        if (!firnUser) {

          // Create new user from GoogleUser with all required FirnUser fields
          const newFirnUser: Omit<FirnUser, '_id' | '_rev'> = {
            type: 'user',
            // Google-specific fields
            googleId: googleUser.googleId,
            googleName: googleUser.googleName,
            googleGivenName: googleUser.googleGivenName,
            googleFamilyName: googleUser.googleFamilyName,
            googleAvatar: googleUser.googleAvatar,
            googleEmail: googleUser.googleEmail,
            googleEmailVerified: googleUser.googleEmailVerified,
            // GitHub-specific fields (empty for new users)
            githubId: undefined,
            githubName: undefined,
            githubAvatar: undefined,
            githubEmail: undefined,
            githubUrl: undefined,
            // Timestamps
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            // User properties (new users are not approved by default)
            allowLogin: false,
            isRetired: false,
            isAdmin: false,
            permissions: [],
            tokens: [],
            sessions: [],
            // User-related collections
            todos: [],
            preferences: []
          }

          const newUser = await UserService.createUser(newFirnUser)

          await setUserSession(event, {
            user: googleUser,
            private: newUser
          })

          // New user - redirect back to login page with linking state
          return sendRedirect(event, '/?state=link-github')

        } else {

          if (!firnUser.allowLogin || firnUser.isRetired) {
            // User is not approved or retired, redirect to pending page
            return sendRedirect(event, '/pending-approval')

          } else {

          // User is approved, set session and redirect to main app

          await setUserSession(event, {
            user: googleUser,
            private: firnUser
          })
          return sendRedirect(event, '/firn')
        }
      }

    } catch (error) {
      console.error('Error in Google OAuth handler of user', user.name, user.email, error)
      return sendRedirect(event, '/auth-error')
    }
  }
})
