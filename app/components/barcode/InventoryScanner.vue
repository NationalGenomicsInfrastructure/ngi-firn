<script setup lang="ts">
import type { DetectedCode, ZxingReaderInstance } from '../../../types/barcode'
import { normalizeBarcode } from '~~/schemas/inventory/barcode'

/*
 * Inventory barcode capture.
 * *************************
 *
 * Emits a single scanned or typed inventory barcode. Deliberately not a dialog: it
 * is embedded inside a stepper step here and can be wrapped in a dialog elsewhere
 * later. It reuses the debounce-and-autofocus interaction proven by the login-token
 * scanner (DialogTokenLogin.vue) but shares no code and carries no login semantics —
 * inventory codes ("fi…/fc…/fe…" or an external vendor label) are validated on the
 * server at create time, so nothing is asserted about the format locally.
 */

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  autofocus?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Scan or type a barcode',
  autofocus: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'scanned': [value: string]
}>()

const { showWarning } = useFirnToast()

const enableCamera = ref(false)
const zxingReaderRef = useTemplateRef<ZxingReaderInstance>('zxingReaderRef')

// Local mirror of the bound value so the input stays editable while still emitting
// upward. Kept in sync with the parent through the watcher below.
const localValue = ref(props.modelValue)

watch(() => props.modelValue, (value) => {
  if (value !== localValue.value) localValue.value = value ?? ''
})

/*
 * Debounce input so a keyboard-wedge scanner — which types a whole code in a burst
 * and usually ends with Enter — is treated as one capture rather than a stream of
 * keystrokes. A typed code settles the same way.
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function onInput(value: string | undefined) {
  const next = value ?? ''
  localValue.value = next
  emit('update:modelValue', next)

  clearDebounce()
  debounceTimer = setTimeout(() => {
    const trimmed = normalizeBarcode(next)
    if (trimmed) emit('scanned', trimmed)
  }, 300)
}

function onSubmit() {
  clearDebounce()
  const trimmed = normalizeBarcode(localValue.value)
  if (trimmed) emit('scanned', trimmed)
}

function clearValue() {
  clearDebounce()
  localValue.value = ''
  emit('update:modelValue', '')
}

// Use the shared detections composable so a shaky read stabilises on the most
// frequently seen code before it is accepted, exactly as the camera dialogs do.
const {
  upsertZxingDetection,
  mostDetectedItem,
  clearDetections
} = useBarcodeDetections()

function onDetect(codes: DetectedCode[]) {
  codes.forEach(code => upsertZxingDetection(code))

  const detection = mostDetectedItem.value
  if (!detection) return

  // Only 1D inventory labels are meaningful here; a QR code is never an inventory
  // barcode, so it is rejected with a pointer instead of being accepted blindly.
  if (detection.format === 'QRCode') {
    showWarning('A QR code is not an inventory barcode.', 'Unexpected code')
    return
  }

  const code = normalizeBarcode(detection.code)
  if (!code) return

  localValue.value = code
  emit('update:modelValue', code)
  emit('scanned', code)
  // Stop the camera once a code is captured; the user confirms with Next.
  enableCamera.value = false
}

function disableCamera() {
  enableCamera.value = false
}

// Clearing detections whenever the camera turns off keeps a stale read from a
// previous session out of the next capture.
watch(enableCamera, (on) => {
  if (!on) clearDetections()
})

onBeforeUnmount(() => {
  clearDebounce()
  enableCamera.value = false
  clearDetections()
})
</script>

<template>
  <NTabs default-value="reader">
    <NTabsList class="mx-auto border-b border-primary bg-primary-50 dark:bg-primary/10">
      <NTabsTrigger value="reader">
        <NIcon name="i-lucide-scan-barcode" />
        Scanner or keyboard
      </NTabsTrigger>
      <NTabsTrigger value="camera">
        <NIcon name="i-lucide-camera" />
        Device camera
      </NTabsTrigger>
    </NTabsList>

    <NTabsContent value="reader">
      <form
        class="flex flex-row gap-2 p-2"
        @submit.prevent="onSubmit()"
      >
        <NInput
          :model-value="localValue"
          :autofocus="autofocus"
          type="text"
          class="w-full bg-background"
          leading="i-lucide-scan-barcode"
          :placeholder="placeholder"
          size="lg"
          :una="{ inputWrapper: 'w-full' }"
          @update:model-value="onInput"
        />
        <NButton
          btn="soft-error hover:outline-error"
          label="i-lucide-trash-2"
          icon
          size="lg"
          type="button"
          @click="clearValue()"
        />
      </form>
    </NTabsContent>

    <NTabsContent value="camera">
      <NAspectRatio
        v-if="enableCamera"
        :ratio="4 / 3"
        class="border-0.5 border-gray-200 dark:border-gray-800 rounded-lg"
      >
        <LazyBarcodeZxingReader
          ref="zxingReaderRef"
          :video-width="400"
          :video-height="300"
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
              label="i-lucide-camera"
              icon
              size="lg"
              btn="soft-primary hover:outline-primary"
              class="group rounded-full"
              @click="enableCamera = true"
            />
          </NTooltip>
        </div>
      </NAspectRatio>

      <div class="flex flex-col gap-4 sm:flex-row sm:justify-between shrink-0 w-full mt-2 p-2">
        <NButton
          v-if="zxingReaderRef"
          btn="soft-primary hover:outline-primary"
          size="sm"
          :label="`Switch to ${zxingReaderRef.state.usingBack ? 'Front' : 'Back'}`"
          leading="i-lucide-repeat"
          :disabled="!enableCamera"
          @click="zxingReaderRef.switchCamera()"
        />
        <!-- Dummy button prevents layout shift before the reader ref resolves. -->
        <NButton
          v-else
          btn="soft-primary hover:outline-primary"
          size="sm"
          label="Switch camera"
          leading="i-lucide-repeat"
          :disabled="true"
        />
        <NButton
          btn="soft-primary hover:outline-primary"
          size="sm"
          label="Disable camera"
          leading="i-lucide-camera-off"
          :disabled="!enableCamera"
          @click="disableCamera()"
        />
      </div>
    </NTabsContent>
  </NTabs>
</template>
