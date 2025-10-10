<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { validateFirnUserTokenSchema } from '~~/schemas/tokens'
import type { DetectedCode, ZxingReaderInstance } from '../../../types/barcode'

const enableDetection = ref(false)
const zxingReaderRef = useTemplateRef<ZxingReaderInstance>('zxingReaderRef')
const detectedCode = ref(false)
const isSubmitting = ref(false)

// Use the barcode detections composable
const {
  upsertZxingDetection,
  mostDetectedItem,
} = useBarcodeDetections()

function onDetect(codes: DetectedCode[]) {  
  // Process each detected code
  codes.forEach(code => {
    upsertZxingDetection(code)
  })
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
  if (isSubmitting.value) return
  
  try {
    isSubmitting.value = true
    
    // POST to the token endpoint with the token in the Authorization header
    await $fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${values.tokenString}`
      }
    })
    
    // The endpoint handles the redirect automatically
    await navigateTo('/firn')
  } catch (error) {
    console.error('Error during token authentication:', error)
    // The endpoint sets the auth status in the session, which will be displayed via toast
  } finally {
    isSubmitting.value = false
  }
})

watch(mostDetectedItem, async (detection) => {
  if (!detection) return
  // Only process if it's a QR code and the string is long enough to be a likely token (>50 chars)
  if (detection.format === 'QRCode' && detection.code.length > 50) {
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
  }
}, { immediate: true })
</script>
<template>
    <NDialog
    title="Scan your QR code"
    description="Use the camera to scan a QR code of your Firn token"
    :_dialog-footer="{
    class: 'sm:justify-start',
    }"
    scrollable
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
            :video-height="400"
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