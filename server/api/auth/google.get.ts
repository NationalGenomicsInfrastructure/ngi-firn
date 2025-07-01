import { UserService } from '../../utils/users'

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    try {
      // Find or create user in database
      const { user: dbUser, isNew } = await UserService.findOrCreateUser({
        provider: 'google',
        providerId: user.sub,
        name: user.name,
        email: user.email,
        avatar: user.picture
      })
      
      if (isNew) {
        // New user - redirect back to login page with linking state
        return sendRedirect(event, '/?state=link-github&userId=' + dbUser._id)
      }

      // Existing user - check if approved
      const isApproved = await UserService.isUserApproved(dbUser._id)

      if (!isApproved) {
        // User is not approved, redirect to pending page
        return sendRedirect(event, '/pending-approval')
      }

      // User is approved, set session and redirect to main app
      await setUserSession(event, {
        user: {
          provider: 'google',
          id: dbUser._id,
          name: dbUser.name,
          avatar: dbUser.avatar,
          url: ''
        }
      })

      return sendRedirect(event, '/firn')
    } catch (error) {
      console.error('Error in Google OAuth handler:', error)
      return sendRedirect(event, '/auth-error')
    }
  }
})
