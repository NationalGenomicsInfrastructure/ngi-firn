export default defineNuxtRouteMiddleware((to) => {
  const projectId = to.params.projectid as string
  if (!projectId || !/^P[0-9]+$/.test(projectId)) {
    return navigateTo({
      path: '/error/not-found',
      query: {
        from: to.fullPath,
        message: 'invalid-project-id'
      }
    }, { replace: true })
  }
})
