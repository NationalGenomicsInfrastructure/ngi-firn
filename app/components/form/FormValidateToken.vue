<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { validateFirnUserTokenSchema } from '~~/schemas/tokens'
import { validateFirnUserToken } from '~/utils/mutations/tokens'
import type { DetectedCode, ZxingReaderInstance } from '../../../types/barcode'

const props = defineProps<{
  audienceItems: string[]
}>()

const enableDetection = ref(false)
const zxingReaderRef = useTemplateRef<ZxingReaderInstance>('zxingReaderRef')
const detectedCode = ref(false)

// Use the barcode detections composable
const {
  upsertZxingDetection,
  mostDetectedItem
} = useBarcodeDetections()

function onDetect(codes: DetectedCode[]) {
  // Process each detected code
  codes.forEach((code) => {
    upsertZxingDetection(code)
  })
}

watch(mostDetectedItem, (detection) => {
  if (!detection) return
  // Only set the field if it's a QR code and the string is long enough to be a likely token (>50 chars)
  if (detection.format === 'QRCode' && detection.code.length > 50) {
    setFieldValue('tokenString', detection.code)
    enableDetection.value = false // Disable camera after successful detection
    // Show success animation
    detectedCode.value = true

    // Reset animation after delay
    setTimeout(() => {
      detectedCode.value = false
    }, 1500)
  }
}, { immediate: true })

/*
 * Token test: Submit to validation
 */

const formSchemaTest = toTypedSchema(validateFirnUserTokenSchema)

const { handleSubmit: handleSubmitTest, setFieldValue } = useForm({
  validationSchema: formSchemaTest,
  initialValues: {
    tokenString: '',
    expectedAudience: ''
  }
})

const { value: expectedAudienceValue, setValue: setExpectedAudienceValue } = useField<string>('expectedAudience')

const onExpectedAudienceUpdate = (value: string | undefined) => {
  if (!value) return
  setFieldValue('expectedAudience', value)
}

const onTokenTest = handleSubmitTest(async (valuesTest) => {
  try {
    const { validateToken } = validateFirnUserToken()
    validateToken(valuesTest)
  }
  catch (error) {
    console.error(error)
  }
})
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-2 p-auto">
    <NCard
      title="Scan a token's QR code"
      description="Use your camera to scan the QR code of your token"
    >
      <NAspectRatio
        v-if="enableDetection"
        :ratio="4 / 3"
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
        v-else
        :ratio="4 / 3"
        class="border-0.5 border-gray-200 dark:border-gray-800 rounded-lg"
      >
        <div class="flex items-center justify-center h-full">
          <NTooltip
            content="Enable camera"
            tooltip="primary"
          >
            <NButton
              :label="detectedCode ? 'i-lucide-check-circle' : 'i-lucide-camera'"
              icon
              :size="detectedCode ? '4xl' : 'lg'"
              :btn="detectedCode ? 'solid-success' : 'soft-primary hover:outline-primary'"
              class="group rounded-full"
              @click="enableDetection = true"
            />
          </NTooltip>
        </div>
      </NAspectRatio>
      <div class="flex items-center justify-between gap-2 mb-2 mt-2">
        <NButton
          v-if="enableDetection && zxingReaderRef"
          btn="soft-secondary hover:outline-secondary"
          size="sm"
          :label="`Switch to ${zxingReaderRef.state.usingBack ? 'Front' : 'Back'}`"
          leading="i-lucide-repeat"
          @click="zxingReaderRef.switchCamera()"
        />
        <NButton
          btn="soft-primary hover:outline-primary"
          size="sm"
          label="Disable camera"
          leading="i-lucide-camera-off"
          :disabled="!enableDetection"
          @click="enableDetection = false"
        />
      </div>
    </NCard>
    <NCard
      title="Test your token"
      description="Scan or paste your token here and validate it"
    >
      <form
        class="flex flex-col gap-4"
        @submit.prevent="onTokenTest()"
      >
        <NFormField
          name="tokenString"
        >
          <NInput
            type="textarea"
            rows="5"
            class="w-full"
            leading="i-lucide-key-round"
            placeholder="Token to validate"
            :una="{
              inputWrapper: 'w-full'
            }"
          />
        </NFormField>
        <NFormField
          name="expectedAudience"
          description="Validate a proper audience restriction for your token"
        >
          <div class="flex flex-row gap-2">
            <NSelect
              :model-value="expectedAudienceValue"
              placeholder="No restriction"
              :items="props.audienceItems"
              @update:model-value="onExpectedAudienceUpdate"
            />
            <NButton
              v-if="expectedAudienceValue"
              btn="soft-error hover:outline-error"
              label="i-lucide-x-circle"
              icon
              @click="setExpectedAudienceValue('')"
            />
          </div>
        </NFormField>
        <NButton
          label="Validate token"
          btn="soft-primary hover:outline-primary"
          class="w-full"
          type="submit"
          size="md"
        />
      </form>
    </NCard>
  </div>
</template>
