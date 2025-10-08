<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { QuaggaJSCodeReader, InputStreamType } from "@ericblade/quagga2";

const props = defineProps<{
    type: InputStreamType
    readerTypes: QuaggaJSCodeReader[]
}>()

const barcodeData = ref('')
const findingsPagination = ref({ pageSize: 5, pageIndex: 0 })

// Use the barcode findings composable
const {
  findingsById,
  upsertFinding,
  removeFinding,
  clearFindings,
  topFindingCode,
  findingsCount,
  sortedFindings,
} = useBarcodeFindings()

watch(topFindingCode, (code) => {
  barcodeData.value = code || ''
}, { immediate: true })

function handleDetected(result: any) {
  upsertFinding(result)
  const code: string | undefined = result?.codeResult?.code
  if (code) barcodeData.value = code
}

defineExpose({ findingsById, removeFinding })
const { copy, copied } = useClipboard({ source: barcodeData })
</script>

<template>
  <NDialog
    title="Scan Barcode"
    description="Use the camera to scan a barcode"
    :_dialog-footer="{
      class: 'sm:justify-start',
    }"
  >
    <template #trigger>
      <NButton btn="solid-gray">
        Scan Barcode
      </NButton>
    </template>
    <NAspectRatio
        :ratio="16 / 9"
      >
        <BarcodeReader
        :on-detected="handleDetected"
        :reader-types="props.readerTypes"
        :type="props.type"
        />
    </NAspectRatio>

    <NDivider label="Findings" />

    <div v-if="findingsCount === 0" class="text-sm text-muted">
      No findings yet. Point your camera at a barcode.
    </div>

    <div v-else class="w-full overflow-x-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm text-muted">
          {{ findingsCount }} unique finding(s)
        </div>
        <NButton
          btn="soft-error"
          size="sm"
          label="Delete all"
          leading="i-lucide-trash-2"
          @click="clearFindings()"
        />
      </div>
      <NTable
        :columns="[
          { header: 'Format', accessorKey: 'format' },
          { header: 'Code', accessorKey: 'code' },
          { header: 'Detections', accessorKey: 'count' },
        ]"
        :data="sortedFindings"
        :pagination="findingsPagination"
        :default-sort="{ id: 'count', desc: true }"
        enable-sorting
        empty-text="No findings"
      />
      <div
        v-if="findingsCount > findingsPagination.pageSize"
        class="flex items-center justify-end mt-3"
      >
        <NPagination
          :page="findingsPagination.pageIndex + 1"
          :total="findingsCount"
          :items-per-page="findingsPagination.pageSize"
          show-edges
          @update:page="(p:number) => findingsPagination.pageIndex = p - 1"
        />
      </div>
    </div>

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

