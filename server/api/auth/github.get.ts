import { UserService } from '../../utils/users'

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    try {
      // Find or create user in database
      const { user: dbUser, isNew } = await UserService.findOrCreateUser({
        provider: 'github',
        providerId: String(user.id),
        name: user.name || user.login,
        email: user.email,
        avatar: user.avatar_url,
        url: user.html_url
      })

      // Check if user is approved
      const isApproved = await UserService.isUserApproved(dbUser._id)
      
      if (!isApproved) {
        // User is not approved, redirect to pending page
        return sendRedirect(event, '/pending-approval')
      }

      // User is approved, set session and redirect to main app
      await setUserSession(event, {
        user: {
          provider: 'github',
          id: dbUser._id,
          name: dbUser.name,
          avatar: dbUser.avatar,
          url: dbUser.githubUrl || ''
        }
      })

      return sendRedirect(event, '/firn')
    } catch (error) {
      console.error('Error in GitHub OAuth handler:', error)
      return sendRedirect(event, '/auth-error')
    }
  }
})
