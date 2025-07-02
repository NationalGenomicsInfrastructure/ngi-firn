import { UserService } from '../../utils/users'
import type { GoogleUser } from '../../../types/auth'

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {

    /** user object example from Google OAuth:
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
      await clearUserSession(event)
      return sendRedirect(event, '/auth-error', 403)
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

    /**
     * We need to distinguish between three cases:
     * 1. User is already in the database and is approved
     * 2. User is already in the database but not approved
     * 3. User is not in the database (new registration)
     */

    try {

      // Search for existing user in database
      const firnUser = await UserService.matchGoogleUser(googleUser)
      
      if (firnUser) {
      
        if (!firnUser.allowLogin || firnUser.isRetired) {

          // User is not approved or retired, redirect to pending page (case 2)
          await clearUserSession(event)
          return sendRedirect(event, '/pending-approval', 401)

        } else {

        // User is approved, set session and redirect to main app (case 1)

        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(firnUser, 'google')

        await replaceUserSession(event, {
          user: sessionUser,
          private: sessionUserSecure
        })

        return sendRedirect(event, '/firn', 201)
        }
      
      } else {

        // Create a new, unapproved user from the GoogleUser (case 3)
        const newUser = await UserService.convertGoogleUserToFirnUser(googleUser)
        // add to database
        const newFirnUser = await UserService.createUser(newUser)

        if (!newFirnUser) {
          await clearUserSession(event)
          return sendRedirect(event, '/auth-error', 401)
        }
        // convert to session user
        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(newFirnUser, 'google')

        await replaceUserSession(event, {
          user: sessionUser,
          secure: sessionUserSecure
        })

        // New user - redirect back to login page with linking state
        return sendRedirect(event, '/?state=link-github')
      
    }

    } catch (error) {
      console.error('Error in Google OAuth handler of user', user.name, user.email, error)
      await clearUserSession(event)
      return sendRedirect(event, '/auth-error')
    }
  }
})
