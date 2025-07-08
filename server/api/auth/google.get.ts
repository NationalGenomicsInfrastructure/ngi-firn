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
      await setUserSession(event, {
        // Any extra fields for the session data
        authStatus: {
          kind: 'error',
          reject: true,
          title: 'Account creation rejected',
          message: 'Only users from SciLifeLab can sign in'
        }
      })
      return sendRedirect(event, '/?stage=clear', 401)
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
          await replaceUserSession(event, {
            // Any extra fields for the session data
            authStatus: {
              kind: 'warning',
              reject: true,
              title: 'Account is awaiting approval',
              message: 'Your account is not approved yet for access to Firn. Please contact the admin to get access.'
            }
          })
          return sendRedirect(event, '/?stage=pending-approval', 401)

        } else {

        // User is approved, set session and redirect to main app (case 1)

        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(firnUser, 'google')

        await replaceUserSession(event, {
          user: sessionUser,
          private: sessionUserSecure,
          authStatus: {
            kind: 'success',
            reject: false,
            title: 'Welcome to Firn!',
            message: `Successfully signed in as ${sessionUser.name}.`
          }
        })

        return sendRedirect(event, '/firn', 201)
        }
      
      } else {

        // Create a new, unapproved user from the GoogleUser (case 3)
        const newUser = await UserService.convertGoogleUserToFirnUser(googleUser)
        // add to database
        const newFirnUser = await UserService.createUser(newUser)

        if (!newFirnUser) {
          await replaceUserSession(event, {
            // Any extra fields for the session data
            authStatus: {
              kind: 'error',
              reject: true,
              title: 'A technical error occurred',
              message: 'Failed to create new user. Please contact the admin to get access.'
            }
          })
          return sendRedirect(event, '/', 401)
        }
        // convert to session user
        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(newFirnUser, 'google')

        await replaceUserSession(event, {
          user: sessionUser,
          secure: sessionUserSecure,
          authStatus: {
            kind: 'success',
            reject: true,
            title: 'Welcome to Firn!',
            message: `Successfully created your Firn user account ${newFirnUser.name}. You can log in after admin approval.`
          }
        })

        // New user - redirect back to login page with linking state
        return sendRedirect(event, '/',201)
      
    }

    } catch (error) {
      console.error('Error in Google OAuth handler of user', user.name, user.email, error)
      await replaceUserSession(event, {
        // Any extra fields for the session data
        authStatus: {
          kind: 'error',
          reject: true,
          title: 'Technical error with the Google login',
          message: 'An error occurred while signing in with Google. Please try again or contact the admin.'
        }
      })
      return sendRedirect(event, '/', 400)
    }
  },

  async onError(event) {
    console.error('Error in Google OAuth handler:')
    await clearUserSession(event)
    await setUserSession(event, {
      authStatus: {
        kind: 'error',
        reject: true,
        title: 'Technical error with the Google login',
        message: 'An error occurred while signing in with Google. Please try again or contact the admin.'
      }
    })
  }
})
