import { UserService } from '../../utils/users'
import type { GitHubUser, SessionUser, SessionUserSecure } from '../../../types/auth'

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {

    /** user object example:
    * login: '[[:letters:]]+',
    * id: '[[:digits:]]+',
    * node_id: '[[:alnum:]]+',
    * avatar_url: 'URL',
    * gravatar_id: '',
    * url: 'https://api.github.com/users/[[:letters:]]+',
    * html_url: 'https://github.com/[[:letters:]]+',
    * followers_url: 'https://api.github.com/users/[[:letters:]]+/followers',
    * following_url: 'https://api.github.com/users/[[:letters:]]+/following{/other_user}',
    * gists_url: 'https://api.github.com/users/[[:letters:]]+/gists{/gist_id}',
    * starred_url: 'https://api.github.com/users/[[:letters:]]+/starred{/owner}{/repo}',
    * subscriptions_url: 'https://api.github.com/users/[[:letters:]]+/subscriptions',
    * organizations_url: 'https://api.github.com/users/[[:letters:]]+/orgs',
    * repos_url: 'https://api.github.com/users/[[:letters:]]+/repos',
    * events_url: 'https://api.github.com/users/[[:letters:]]+/events{/privacy}',
    * received_events_url: 'https://api.github.com/users/[[:letters:]]+/received_events',
    * type: 'User',
    * user_view_type: 'public',
    * site_admin: Boolean,
    * name: '[[:letters:]]+',
    * company: '[[:letters:]]+',
    * blog: 'URL',
    * location: '[[:letters:]]+',
    * email: null,
    * hireable: null,
    * bio: '[[:letters:]]+',
    * twitter_username: null,
    * notification_email: null,
    * public_repos: '[[:digits:]]+',
    * public_gists: '[[:digits:]]+',
    * followers: '[[:digits:]]+',
    * following: '[[:digits:]]+',
    * created_at: 'YYYY-MM-DDTHH:MM:SSZ',
    * updated_at: 'YYYY-MM-DDTHH:MM:SSZ'
    */

    const githubUser: GitHubUser = {
      provider: 'github',
      githubId: user.id,
      githubName: user.name,
      githubAvatar: user.avatar_url,
      githubEmail: user.email || null,
      githubUrl: user.html_url
    }

    /**
     * Since Google is our source of truth, GitHub users must exist in the database or are rejected.
     * There is one exception: If we can match the GitHub user to a Google user, we will link the two.
     * 1. User is already in the database and is approved -> log in and redirect to main app
     * 2. User is already in the database but not approved -> redirect to pending page
     * 3. GitHub user can be matched to User from Google -> link the two.
     * 4. GitHub user cannot be matched to existing user -> reject.
     */

    try {

      // Search for existing user in database
      // This will only work, if the accounts have already been linked previously, since the match is based on otherwise unknown GitHub ID.
      // (Matching based on the e-mail address is too flaky)
      const firnUser = await UserService.matchGitHubUser(githubUser)
      
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
          return sendRedirect(event, '/', 401)

        } else {

        // User is approved, set session and redirect to main app (case 1)

        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(firnUser, 'github')

        await replaceUserSession(event, {
          user: sessionUser,
          secure: sessionUserSecure,
          authStatus: {
            kind: 'success',
            reject: false,
            title: 'Welcome to Firn!',
            message: `Successfully signed in as ${sessionUser.name}.`
          }

        })

        return sendRedirect(event, '/firn', 201)
        }
      
      } else { // no FirnUser found in the database based on the GitHub ID -> this is likely a linking attempt

      // get the existing session, if it is a linking attempt, there should be a (Google) sessionUser with a linkedGitHub field
      const session = await getUserSession(event) // get the server session
      const sessionUser = session?.user as SessionUser

      if(sessionUser.linkedGitHub){
      
        // The sessionUser is already linked to a GitHub user, but it was not matched to the current OAuth GitHub user -> reject
        await replaceUserSession(event, {
          authStatus: {
            kind: 'error',
            reject: true,
            title: 'Account already linked',
            message: 'Your account is already linked to a different GitHub account. Please contact an admin to delete the existing link.'
          }
        })
        return sendRedirect(event, '/', 401)

      } else {
        // The sessionUser is not linked to a GitHub user, so we can link it to the current OAuth GitHub user

        // get the Document ID of the FirnUser in the database. This information is stored in the secure parts of the session on the server and unavailable to the client.
        const sessionUserSecure = session?.secure as SessionUserSecure

        // get the FirnUser from the database based on the Document ID
        const referenceUser = await UserService.matchSessionUserSecure(sessionUserSecure)

        if (referenceUser) {
          // link the FirnUser to the OAuth GitHub user
          const linkedUser = await UserService.linkGitHubUser(referenceUser, githubUser)

          if (linkedUser) {
            // update the sessionUser with the linked GitHub user
            // convert to session user
            const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(linkedUser, 'github')

            // update the sessionUser with the linked GitHub user
            await replaceUserSession(event, {
              user: sessionUser,
              secure: sessionUserSecure,
              authStatus: {
                kind: 'success',
                reject: true,
                title: 'GitHub login method successfully linked',
                message: `Successfully linked your Firn user account ${referenceUser.name} to your GitHub account.`
              }
            })
            return sendRedirect(event, '/', 201)
          } else { // the linking failed, likely a database issue with updating the document then.
            // error linking the FirnUser to the OAuth GitHub user
            await replaceUserSession(event, {
              authStatus: {
                kind: 'error',
                reject: true,
                title: 'Error linking GitHub account',
                message: 'An error occurred while linking your GitHub account. Please try again.'
              }
            })
            return sendRedirect(event, '/', 401)
          }
        } else { // no reference user found. There is no document in the database with the same Document ID as the sessionUserSecure.
          // error matching the FirnUser to the OAuth GitHub user
          await replaceUserSession(event, {
            authStatus: {
              kind: 'error',
              reject: true,
              title: 'Error identifying your Firn user account.',
              message: 'An error occurred while loading your Firn user account. Please log in with your Google account instead.'
            }
          })
          return sendRedirect(event, '/', 401)
        }
      }}

    } catch (error) {
      console.error('Error in GitHub OAuth handler of user', user.name, user.email, error)
      await replaceUserSession(event, {
        // Any extra fields for the session data
        authStatus: {
          kind: 'error',
          reject: true,
          title: 'Technical error with the GitHub login',
          message: 'An error occurred while signing in with GitHub. Please try again or contact the admin.'
        }
      })
      return sendRedirect(event, '/', 400)
    }
  },

  async onError(event) {
    console.error('Error in GitHub OAuth handler:')
    await clearUserSession(event)
    await setUserSession(event, {
      authStatus: {
        kind: 'error',
        reject: true,
        title: 'Technical error with the GitHub login',
        message: 'An error occurred while signing in with GitHub. Please try again or contact the admin.'
      }
    })
  }
})
