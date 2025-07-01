import { UserService } from '../../utils/users'
import { couchDB } from '../../database/couchdb'

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
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
