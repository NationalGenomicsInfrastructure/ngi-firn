/**
 * Use this composable to show consistently styled toast notifications in the application.
 *
 * Example:
 *
 * <script setup lang="ts">
 * const { showSuccess, showError, showWarning, showInfo } = useFirnToast()
 *
 * const actions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      alert('Retry clicked')
    },
  },
  {
    label: 'Dismiss',
    btn: 'solid-white',
    altText: 'Error',
    onClick: () => {
      alert('Dismiss clicked')
    },
  },
]
 * </script>
 *
 * <template>
 *  <button @click="showSuccess('User created successfully!', 'Success', { actions })">Show Success</button>
 *  <button @click="showError('Failed to save data', 'Error', { actions })">Show Error</button>
 *  <button @click="showWarning('Please check your input', 'Validation Warning', { actions })">Show Warning</button>
 *  <button @click="showInfo('Processing your request...', 'Information', { actions })">Show Info</button>
 * </template>
 *
*/

export const useFirnToast = () => {
  const { toast } = useToast()

  const showSuccess = (message: string, title?: string, additionalProps?: Record<string, unknown>) => {
    toast({
      title: title || 'Success',
      description: message,
      closable: true,
      duration: 6000,
      showProgress: true,
      leading: 'i-lucide-circle-check',
      class: 'alert-border-emerald',
      progress: 'emerald',
      ...additionalProps
    })
  }

  const showWarning = (message: string, title?: string, additionalProps?: Record<string, unknown>) => {
    toast({
      title: title || 'Warning',
      description: message,
      closable: true,
      duration: 6000,
      showProgress: true,
      leading: 'i-lucide-triangle-alert',
      class: 'alert-border-amber',
      progress: 'amber',
      ...additionalProps
    })
  }

  const showError = (message: string, title?: string, additionalProps?: Record<string, unknown>) => {
    toast({
      title: title || 'Error',
      description: message,
      closable: true,
      duration: 6000,
      showProgress: true,
      leading: 'i-lucide-circle-x',
      class: 'alert-border-red',
      progress: 'red',
      ...additionalProps
    })
  }

  const showInfo = (message: string, title?: string, additionalProps?: Record<string, unknown>) => {
    toast({
      title: title || 'Information',
      description: message,
      closable: true,
      duration: 6000,
      showProgress: true,
      leading: 'i-lucide-info',
      class: 'alert-border-indigo',
      progress: 'indigo',
      ...additionalProps
    })
  }

  return {
    showSuccess,
    showWarning,
    showError,
    showInfo
  }
}
