export const useAuthStatusToast = (options?: { showSuccessMessages?: boolean }) => {
  const { session } = useUserSession()
  const { toast } = useToast()

  // Default to showing success messages if not specified
  const showSuccessMessages = options?.showSuccessMessages ?? true

  // Function to get hardcoded toast classes for each auth status kind
  const getToastClass = (kind: string) => {
    switch (kind) {
      case 'success':
        return {
          leading: 'i-lucide-circle-check',
          class: 'alert-border-emerald',
          progress: 'emerald'
        }
      case 'warning':
        return {
          leading: 'i-lucide-triangle-alert',
          class: 'alert-border-amber',
          progress: 'amber'
        }
      case 'error':
        return {
          leading: 'i-lucide-circle-x',
          class: 'alert-border-red',
          progress: 'red'
        }
      case 'base':
      default:
        return {
          leading: 'i-lucide-info',
          class: 'alert-border-indigo',
          progress: 'indigo'
        }
    }
  }

  // Set up the watcher immediately when the composable is called
  // The watch function returns a StopHandle function that can be called to stop the watcher
  const authStatusWatcher = watch(() => session.value?.authStatus, (newAuthStatus, oldAuthStatus) => {
    if (newAuthStatus && newAuthStatus !== oldAuthStatus) {
      // Skip success messages if showSuccessMessages is false
      if (newAuthStatus.kind === 'success' && !showSuccessMessages) {
        return
      }

      const toastClass = getToastClass(newAuthStatus.kind)
      nextTick(() => {
        toast({
          title: newAuthStatus.title,
          description: newAuthStatus.message,
          closable: true,
          duration: 6000,
          showProgress: true,
          ...toastClass
        })
      })
    }
  }, { immediate: true })

  // Return the stop function in case we need to clean up
  return {
    authStatusWatcher
  }
}
