<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { Table } from '@tanstack/vue-table'
import type { ZxingReaderInstance, BarcodeDetection, DetectedCode } from '../../../types/barcode'

const barcodeData = ref('')
const findingsPagination = ref({ pageSize: 3, pageIndex: 0 })
const enableDetection = ref(true)
const table = useTemplateRef<Table<BarcodeDetection>>('table')
const zxingReaderRef = useTemplateRef<ZxingReaderInstance>('zxingReaderRef')

// Use the barcode detections composable
const {
  findingsById,
  upsertZxingDetection,
  removeDetection,
  clearDetections,
  mostDetectedCode,
  detectionCount,
  sortedDetections
} = useBarcodeDetections()

watch(mostDetectedCode, (code) => {
  barcodeData.value = code || ''
}, { immediate: true })

function onDetect(codes: DetectedCode[]) {
  // Process each detected code
  codes.forEach((code) => {
    upsertZxingDetection(code)
  })
}

defineExpose({ findingsById, removeDetection })
const { copy, copied } = useClipboard({ source: barcodeData })
</script>

<template>
  <NDialog
    title="Scan QR Code or barcode"
    description="Use the camera to scan a QR code or barcode"
    :_dialog-footer="{
      class: 'sm:justify-start'
    }"
    scrollable
  >
    <template #trigger>
      <NButton
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-qr-code"
      >
        Scan QR Code
      </NButton>
    </template>
    <NAspectRatio
      v-if="enableDetection"
      :ratio="4 / 3"
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
            @click="enableDetection = true"
          />
        </NTooltip>
      </div>
    </NAspectRatio>

    <div class="flex items-center justify-between mb-2">
      <NButton
        btn="soft-error hover:outline-error"
        size="sm"
        label="Delete all"
        leading="i-lucide-trash-2"
        @click="clearDetections()"
      />
      <NButton
        v-if="zxingReaderRef"
        btn="soft-primary hover:outline-primary"
        size="sm"
        :label="`Switch to ${zxingReaderRef.state.usingBack ? 'Front' : 'Back'}`"
        leading="i-lucide-repeat"
        :disabled="!enableDetection"
        @click="zxingReaderRef.switchCamera()"
      />
      <!-- Dummy button to show the 'switch camera' button even when we don't have a zxingReaderRef. Purely visual to prevent layout shift with jumping buttons -->
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
        :disabled="!enableDetection"
        @click="enableDetection = false"
      />
    </div>

    <NSeparator
      :label="`${detectionCount} unique detections`"
      class="mx-2 my-4"
    />

    <div
      v-if="detectionCount === 0"
      class="text-sm text-muted"
    >
      No findings yet. Point your camera at a QR code or barcode.
    </div>

    <div
      v-else
      class="w-full overflow-x-auto"
    >
      <NTable
        ref="table"
        :columns="[
          { header: 'Format', accessorKey: 'format' },
          { header: 'Detections', accessorKey: 'count' },
          { header: 'Code', accessorKey: 'code' }
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
      label="Copy the most often detected code"
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
          inputWrapper: 'w-full'
        }"
        read-only
      />

      <NButton
        icon
        square
        type="submit"
        :btn="copied ? 'outline' : 'solid'"
        :label="!copied ? 'i-lucide-copy' : 'i-lucide-check'"
      />
    </form>

    <template #footer>
      <NDialogClose>
        <div class="flex flex-col gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
          <NButton
            label="Cancel"
            class="transition delay-300 ease-in-out"
            btn="soft-gray hover:outline-gray"
            trailing="i-lucide-x"
          />
          <NButton
            label="Copy and close"
            class="transition delay-300 ease-in-out"
            btn="soft-primary hover:outline-primary"
            trailing="i-lucide-copy"
            @click="copy(barcodeData)"
          />
        </div>
      </NDialogClose>
    </template>
  </NDialog>
</template>
