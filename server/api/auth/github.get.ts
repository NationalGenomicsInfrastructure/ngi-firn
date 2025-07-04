import { UserService } from '../../utils/users'
import type { GitHubUser } from '../../../types/auth'

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
      const firnUser = await UserService.matchGitHubUser(githubUser)
      
      if (firnUser) {
      
        if (!firnUser.allowLogin || firnUser.isRetired) {

          // User is not approved or retired, redirect to pending page (case 2)
          await replaceUserSession(event, {
            // Any extra fields for the session data
            authStatus: {
              kind: 'warning',
              reject: true,
              message: 'Your account is not approved yet for access to Firn. Please contact the admin to get access.'
            }
          })
          return sendRedirect(event, '/', 401)

        } else {

        // User is approved, set session and redirect to main app (case 1)

        const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(firnUser, 'github')

        await replaceUserSession(event, {
          user: sessionUser,
          secure: sessionUserSecure
        })

        return sendRedirect(event, '/firn', 201)
        }
      
      } else {

      // GitHub user cannot be matched to existing user -> test if this is a linking attempt

      // get the existing session, if it is a linking attempt, there should be a (Google) sessionUser with a linkedGitHub field
      const session = await getUserSession(event)

      console.log('session', session)
      }

    } catch (error) {
      console.error('Error in GitHub OAuth handler of user', user.name, user.email, error)
      await clearUserSession(event)
      return sendRedirect(event, '/auth-error', 403)
    }
  }
})
