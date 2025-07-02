import { UserService } from '../../utils/users'
import { couchDB } from '../../database/couchdb'

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
    try {
      // Get query parameters to check if this is a linking flow
      const query = getQuery(event)
      const linkingUserId = query.userId as string
      
      if (linkingUserId) {
        // This is a linking flow - link GitHub to existing user
        const existingUser = await UserService.getUserById(linkingUserId)
        
        if (!existingUser) {
          throw new Error('User not found for linking')
        }

        // Link GitHub account to the existing user
        const updates: Partial<typeof existingUser> = {
          githubId: String(user.id),
          githubName: user.name || user.login,
          githubAvatar: user.avatar_url,
          githubUrl: user.html_url,
          updatedAt: new Date().toISOString()
        }

        await couchDB.updateDocument(existingUser._id, { ...existingUser, ...updates }, existingUser._rev!)
        
        // Redirect to pending approval
        return sendRedirect(event, '/pending-approval')
      }

      // For direct GitHub login, check if user exists and is approved
      const existingUser = await UserService.getUserByProviderId('github', String(user.id))
      
      if (existingUser) {
        const isApproved = await UserService.isUserApproved(existingUser._id)
        
        if (!isApproved) {
          return sendRedirect(event, '/pending-approval')
        }

        // User is approved, set session and redirect to main app
        await setUserSession(event, {
          user: {
            provider: 'github',
            id: existingUser._id,
            name: existingUser.name,
            avatar: existingUser.avatar,
            url: existingUser.githubUrl || ''
          }
        })

        return sendRedirect(event, '/firn')
      }

      // If no existing user found, redirect to registration flow
      // This will prompt the user to register with Google first
      return sendRedirect(event, '/?state=signup-google&email=' + encodeURIComponent(String(user.email)))
    } catch (error) {
      console.error('Error in GitHub OAuth handler:', error)
      return sendRedirect(event, '/auth-error')
    }
  }
})
