<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { QuaggaJSCodeReader, InputStreamType } from "@ericblade/quagga2";

const props = defineProps<{
    type: InputStreamType
    readerTypes: QuaggaJSCodeReader[]
}>()

type BarcodeFinding = {
  id: string
  code: string
  format: string
  confidence?: number
  count: number
  // geometry from latest detection
  lastBox?: unknown
  lastLine?: unknown
  // small ring buffer of recent samples
  samples: Array<{
    confidence?: number
    box?: unknown
    line?: unknown
  }>
}

const barcodeData = ref('')
const findingsById = reactive<Record<string, BarcodeFinding>>({})

function normalizeDetection(result: any): BarcodeFinding | null {
  const code: string | undefined = result?.codeResult?.code
  const format: string | undefined = result?.codeResult?.format
  const confidence: number | undefined =
    typeof result?.codeResult?.confidence === 'number'
      ? result.codeResult.confidence
      : undefined

  if (!code || !format) return null

  const id = `${format}:${code}`

  return {
    id,
    code,
    format,
    confidence,
    count: 1,
    lastBox: result?.box,
    lastLine: result?.line,
    samples: [
      {
        confidence,
        box: result?.box,
        line: result?.line,
      },
    ],
  }
}

function upsertFinding(result: any) {
  const normalized = normalizeDetection(result)
  if (!normalized) return

  const existing = findingsById[normalized.id]
  if (!existing) {
    findingsById[normalized.id] = normalized
    return
  }

  existing.count += 1
  existing.confidence = normalized.confidence ?? existing.confidence
  existing.lastBox = normalized.lastBox
  existing.lastLine = normalized.lastLine
  existing.samples.push({
    confidence: normalized.confidence,
    box: normalized.lastBox,
    line: normalized.lastLine,
  })
  if (existing.samples.length > 5) existing.samples.shift()
}

function handleDetected(result: any) {
  upsertFinding(result)
  const code: string | undefined = result?.codeResult?.code
  if (code) barcodeData.value = code
}

function removeFinding(id: string) {
  if (id in findingsById) delete findingsById[id]
}

function clearFindings() {
  for (const key of Object.keys(findingsById)) delete findingsById[key]
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

    <div v-if="Object.keys(findingsById).length === 0" class="text-sm text-muted">
      No findings yet. Point your camera at a barcode.
    </div>

    <div v-else class="w-full overflow-x-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm text-muted">
          {{ Object.keys(findingsById).length }} unique finding(s)
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
        :data="Object.values(findingsById).sort((a, b) => b.count - a.count)"
        :pagination="{ pageSize: 5, pageIndex: 0 }"
        :default-sort="{ id: 'count', desc: true }"
        enable-sorting
        empty-text="No findings"
      />
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

