export default defineNuxtRouteMiddleware(() => {
  const { session } = useUserSession()

  // client-side functionality, redirect non-admin users to the firn page. 
  // tRPC procedures are additionally properly protected server-side.
  watch(session, () => {
    if (!session.value?.user?.isAdminClientside) {
      navigateTo('/firn')
    }
  }, { immediate: true })
})
