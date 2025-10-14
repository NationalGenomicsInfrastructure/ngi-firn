<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { validateFirnUserTokenSchema } from '~~/schemas/tokens'
import type { DetectedCode, ZxingReaderInstance } from '../../../types/barcode'

const { loggedIn, fetch: fetchUserSession, clear: clearUserSession } = useUserSession()
const { showError, showWarning } = useFirnToast()

const enableDetection = ref(false)
const zxingReaderRef = useTemplateRef<ZxingReaderInstance>('zxingReaderRef')
const detectedCode = ref(false)
const isSubmitting = ref(false)
const isDialogOpen = ref(false)
const hasProcessedToken = ref(false)

// Use the barcode detections composable
const {
  upsertZxingDetection,
  mostDetectedItem,
  clearDetections,
} = useBarcodeDetections()

// Clear detections and reset state when dialog opens
function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
  if (open) {
    clearDetections()
    hasProcessedToken.value = false
    detectedCode.value = false
    isSubmitting.value = false
    setFieldValue('tokenString', '')
  } else {
    // Clean up when dialog closes
    enableDetection.value = false
  }
}

function onDetect(codes: DetectedCode[]) {  
  
  // Skip if already processing
  if (hasProcessedToken.value || isSubmitting.value) {
    return
  }
  
  // Process each detected code
  codes.forEach(code => {
    upsertZxingDetection(code)
  })
    
  // Directly process the most detected item
  const detection = mostDetectedItem.value
  if (detection && detection.format === 'QRCode' && detection.code.length > 50) {
    setFieldValue('tokenString', detection.code)
    enableDetection.value = false // Disable camera after successful detection
    // Show success animation
    detectedCode.value = true
    
    // Reset animation after delay, then submit
    setTimeout(async () => {
      detectedCode.value = false
      // Automatically submit the token
      await onSubmit()
    }, 1500)
  } else {
    showWarning('The QR code is apparently not a valid Firn token.', 'Invalid token')
  }
}

const formSchema = toTypedSchema(validateFirnUserTokenSchema)

const { handleSubmit, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    tokenString: '',
    expectedAudience: ''
  }
})

// Submit function that POSTs to the token endpoint
const onSubmit = handleSubmit(async (values) => {
  if (isSubmitting.value || hasProcessedToken.value) return
  
  try {
    isSubmitting.value = true
    hasProcessedToken.value = true

    if (loggedIn.value) {
      await clearUserSession()
    }
    
    // POST to the token endpoint with the token in the Authorization header
    await $fetch('/api/auth/token?redirectUrl=/firn', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${values.tokenString}`
      }
    })

    await fetchUserSession()
    await navigateTo('/firn')

  } catch (error) {
    showError('An error occurred during token authentication: ' + error, 'Error')
    // Reset the flag so user can try again
    hasProcessedToken.value = false
  } finally {
    isSubmitting.value = false
  }
})
</script>
<template>
    <NDialog
    title="Scan your QR code"
    description="Use the camera to scan a QR code of your Firn token"
    :_dialog-footer="{
    class: 'sm:justify-start',
    }"
    scrollable
    @update:model-value="onDialogOpenChange"
    >
    <template #trigger>
          <NButton
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-qr-code"
            label="Sign in with Firn Token"
            class="w-full"
            size="md"
          />
    </template>

    <NAspectRatio
        :ratio="4 / 3"
        v-if="enableDetection"
        class="border-0.5 border-gray-200 dark:border-gray-800 rounded-lg"
        >
        <BarcodeZxingReader
            ref="zxingReaderRef"
            :video-width="400"
            :video-height="300"
            :prefer-wasm="true"
            @detect="onDetect"
        />
        </NAspectRatio>
        <NAspectRatio
            :ratio="4 / 3"
            v-else
            class="border-0.5 border-gray-200 dark:border-gray-800 rounded-lg"
        >
            <div class="flex items-center justify-center h-full">
            <NTooltip :content="isSubmitting ? 'Authenticating...' : 'Enable camera'" tooltip="primary">
                <NButton
                :label="isSubmitting ? 'i-lucide-loader-circle' : (detectedCode ? 'i-lucide-check-circle' : 'i-lucide-camera')"
                icon
                :size="detectedCode || isSubmitting ? '4xl' : 'lg'"
                :btn="isSubmitting ? 'solid-primary' : (detectedCode ? 'solid-success' : 'soft-primary hover:outline-primary')"
                :class="isSubmitting ? 'animate-spin' : ''"
                class="group rounded-full"
                :disabled="isSubmitting"
                @click="enableDetection = true"
                />
            </NTooltip>
            </div>
        </NAspectRatio>
        <div class="flex items-center justify-between gap-2 mb-2 mt-2">
            <NButton
                btn="soft-secondary hover:outline-secondary"
                size="sm"
                :label="`Switch to ${zxingReaderRef.state.usingBack ? 'Front' : 'Back'}`"
                leading="i-lucide-repeat"
                v-if="enableDetection && zxingReaderRef"
                :disabled="isSubmitting"
                @click="zxingReaderRef.switchCamera()"
            />
            <NButton
                btn="soft-primary hover:outline-primary"
                size="sm"
                label="Disable camera"
                leading="i-lucide-camera-off"
                :disabled="!enableDetection || isSubmitting"
                @click="enableDetection = false"
            />
        </div>

    <template #footer>
        <NDialogClose>
            <div class="flex flex-col gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
            <NButton
                label="Cancel"
                class="transition delay-300 ease-in-out"
                btn="soft-gray hover:outline-gray"
                trailing="i-lucide-x"
            />
            </div>
        </NDialogClose>
        </template>
    </NDialog>
</template>