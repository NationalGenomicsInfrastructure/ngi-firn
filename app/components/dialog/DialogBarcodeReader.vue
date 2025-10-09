<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { QuaggaJSCodeReader, InputStreamType } from "@ericblade/quagga2";
import type { Table } from '@tanstack/vue-table'
import type { BarcodeDetection } from '../../../types/barcode'

/*
 * Properties
 * *********************************
 * type: The type of input stream to use (e.g. "LiveStream", "Image")
 * readerTypes: The types of readers to use (e.g. ["code_128_reader", "code_39_reader"])
 * 
 * Codabar - Older format used in libraries, blood banks, and logistics. Can encode numbers and a few special characters.
 * Code 32 (Italian Pharmacode) - Used specifically for pharmaceutical products in Italy.
 * Code 39 - Can encode letters, numbers, and some special characters. Common in automotive, defense, and healthcare industries.
 * Code 39 VIN - Specialized for Vehicle Identification Numbers.
 * Code 93 - Similar to Code 39 but more compact. Used by Canada Post and in logistics.
 * Code 128 - A high-density barcode that can encode all 128 ASCII characters. Very versatile and commonly used in shipping, packaging, and logistics.
 * EAN (European Article Number) - Used primarily for retail products. EAN-13 (13 digits) is the most common, EAN-8 is a shorter version for small packages.
 * EAN-5 and EAN-2 - Supplemental barcodes used alongside main barcodes on books and magazines for price/issue information.
 * Interleaved 2 of 5 and Standard 2 of 5 - Numeric-only barcodes used in warehousing and industrial applications.
 * UPC (Universal Product Code) - The North American equivalent of EAN, commonly seen on retail products. UPC-A is 12 digits, UPC-E is a compressed version.
 */
const props = defineProps<{
    type: InputStreamType
    readerTypes: QuaggaJSCodeReader[]
}>()

const barcodeData = ref('')
const findingsPagination = ref({ pageSize: 3, pageIndex: 0 })
const enableDetection = ref(true)
const table = useTemplateRef<Table<BarcodeDetection>>('table')

// Use the barcode detections composable
const {
  findingsById,
  upsertDetection,
  removeDetection,
  clearDetections,
  mostDetectedCode,
  detectionCount,
  sortedDetections,
} = useBarcodeDetections()

watch(mostDetectedCode, (code) => {
  barcodeData.value = code || ''
}, { immediate: true })

defineExpose({ findingsById, removeDetection })
const { copy, copied } = useClipboard({ source: barcodeData })
</script>

<template>
  <NDialog
    title="Scan Barcode"
    description="Use the camera to scan a barcode"
    :_dialog-footer="{
      class: 'sm:justify-start',
    }"
    scrollable
  >
    <template #trigger>
      <NButton btn="solid-gray">
        Scan Barcode
      </NButton>
    </template>
    <NAspectRatio
        :ratio="4 / 3"
        v-if="enableDetection"
      >
        <BarcodeReader
        :on-detected="upsertDetection"
        :reader-types="props.readerTypes"
        :type="props.type"
        />
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

