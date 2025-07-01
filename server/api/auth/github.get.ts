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

      // Check if user exists by GitHub ID
      const existingUserByGitHub = await UserService.getUserByProviderId('github', String(user.id))
      
      if (existingUserByGitHub) {
        // User exists with this GitHub account
        const isApproved = await UserService.isUserApproved(existingUserByGitHub._id)
        
        if (!isApproved) {
          return sendRedirect(event, '/pending-approval')
        }

        // User is approved, set session and redirect to main app
        await setUserSession(event, {
          user: {
            provider: 'github',
            id: existingUserByGitHub._id,
            name: existingUserByGitHub.name,
            avatar: existingUserByGitHub.avatar,
            url: existingUserByGitHub.githubUrl || ''
          }
        })

        return sendRedirect(event, '/firn')
      }

      // Check if user exists by email (to link GitHub to existing Google account)
      const existingUserByEmail = await UserService.getUserByEmail(String(user.email))
      
      if (existingUserByEmail) {
        // Link GitHub account to existing user
        const updates: Partial<typeof existingUserByEmail> = {
          githubId: String(user.id),
          githubName: user.name || user.login,
          githubAvatar: user.avatar_url,
          githubUrl: user.html_url,
          updatedAt: new Date().toISOString()
        }

        await couchDB.updateDocument(existingUserByEmail._id, { ...existingUserByEmail, ...updates }, existingUserByEmail._rev!)
        
        const isApproved = await UserService.isUserApproved(existingUserByEmail._id)
        
        if (!isApproved) {
          return sendRedirect(event, '/pending-approval')
        }

        // User is approved, set session and redirect to main app
        await setUserSession(event, {
          user: {
            provider: 'github',
            id: existingUserByEmail._id,
            name: existingUserByEmail.name,
            avatar: existingUserByEmail.avatar,
            url: existingUserByEmail.githubUrl || ''
          }
        })

        return sendRedirect(event, '/firn')
      }

      // New user trying to sign up with GitHub - redirect to login page with Google signup state
      return sendRedirect(event, '/?state=signup-google&email=' + encodeURIComponent(String(user.email)))
    } catch (error) {
      console.error('Error in GitHub OAuth handler:', error)
      return sendRedirect(event, '/auth-error')
    }
  }
})
