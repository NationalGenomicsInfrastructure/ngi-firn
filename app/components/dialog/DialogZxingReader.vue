<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { Table } from '@tanstack/vue-table'
import type { BarcodeDetection, DetectedCode } from '../../../types/barcode'

const barcodeData = ref('')
const findingsPagination = ref({ pageSize: 3, pageIndex: 0 })
const enableDetection = ref(true)
const table = useTemplateRef<Table<BarcodeDetection>>('table')

// Use the barcode detections composable
const {
  findingsById,
  upsertZxingDetection,
  removeDetection,
  clearDetections,
  mostDetectedCode,
  detectionCount,
  sortedDetections,
} = useBarcodeDetections()

watch(mostDetectedCode, (code) => {
  barcodeData.value = code || ''
}, { immediate: true })

function onDetect(codes: DetectedCode[]) {
  // Process each detected code
  codes.forEach(code => {
    upsertZxingDetection(code)
  })
}

defineExpose({ findingsById, removeDetection })
const { copy, copied } = useClipboard({ source: barcodeData })
</script>

<template>
  <NDialog
    title="Scan QR Code"
    description="Use the camera to scan a QR code"
    :_dialog-footer="{
      class: 'sm:justify-start',
    }"
    scrollable
  >
    <template #trigger>
      <NButton btn="solid-gray">
        Scan QR Code
      </NButton>
    </template>
    <NAspectRatio
        :ratio="4 / 3"
        v-if="enableDetection"
      >
      <BarcodeZxingReader v-slot:controls="{ state, toggleTorch, switchCamera }"
        :video-width="400"
        :video-height="400"
        :prefer-wasm="true"
        @detect="onDetect">
          <div class="controls">
            <button @click="toggleTorch">
              🔦 Torch: {{ state.torch ? 'ON' : 'OFF' }}
            </button>
            <button @click="switchCamera">
              🔄 Switch to {{ state.usingBack ? 'Front' : 'Back' }} Camera
            </button>
          </div>
      </BarcodeZxingReader>
    </NAspectRatio>
    <NAspectRatio
        :ratio="4 / 3"
        v-else
      >
        <div class="flex items-center justify-center h-full">
          <NButton btn="solid-gray" @click="enableDetection = true">
            Enable Detection
          </NButton>
        </div>
      </NAspectRatio>

    <NDivider label="Detections" />

    <div v-if="detectionCount === 0" class="text-sm text-muted">
      No findings yet. Point your camera at a barcode.
    </div>

    <div v-else class="w-full overflow-x-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm text-muted">
          {{ detectionCount }} unique detection(s)
        </div>
        <NButton
          btn="soft-error"
          size="sm"
          label="Delete all"
          leading="i-lucide-trash-2"
          @click="clearDetections()"
        />
        <NButton
          btn="soft-gray"
          size="sm"
          label="Disable Detection"
          leading="i-lucide-x"
          @click="enableDetection = false"
        />
      </div>
      <NTable
        ref="table"
        :columns="[
          { header: 'Format', accessorKey: 'format' },
          { header: 'Detections', accessorKey: 'count' },
          { header: 'Code', accessorKey: 'code' },
        ]"
        :data="sortedDetections"
        :pagination="findingsPagination"
        empty-text="No detections"
      />
      <div
        v-if="detectionCount > findingsPagination.pageSize"
        class="flex items-center justify-end mt-3"
      >
        <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 5"
        @update:page="table?.setPageIndex($event - 1)"
      />
      </div>
    </div>

    <NSeparator
      label="Copy most detected barcode"
      class="mx-2 my-4"
    />

    <form
      class="flex gap-2"
      @submit.prevent="copy(barcodeData)"
    >
      <NInput
        v-model="barcodeData"
        leading="i-lucide-barcode"
        type="text"
        size="lg"
        :una="{
          inputWrapper: 'w-full',
        }"
        read-only
      />

      <NButton
        icon
        square
        type="submit"
        :btn="copied ? 'outline' : 'solid'"
        :label="!copied ? 'i-radix-icons-copy' : 'i-radix-icons-check'"
      />
    </form>

    <template #footer>
      <NDialogClose>
        <NButton
          btn="soft-gray"
        >
          Close
        </NButton>
      </NDialogClose>
    </template>
  </NDialog>
</template>

