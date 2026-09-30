<script setup lang="ts">
import type { BarcodeEntityKind } from '~~/schemas/inventory/barcode'
import {
  DEFAULT_LABEL_SHEET_PRESET,
  LABEL_SHEET_PRESETS,
  computeSheetLayout
} from '~/utils/inventory/labelSheet'
import type { LabelSheetPresetId } from '~/utils/inventory/labelSheet'
import { assignBarcodes as useAssignBarcodesMutation } from '~/utils/mutations/inventory/barcodes'

export interface PrintableEntity {
  entityKind: BarcodeEntityKind
  slug: string
  name: string
  barcode: string | null
}

const props = defineProps<{
  entities: PrintableEntity[]
}>()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

const { previewLabelSheet, downloadLabelSheet } = useInventoryBarcode()
const { showError } = useFirnToast()
const { mutateAsync: assignBarcodesAsync, isLoading: isIssuing } = useAssignBarcodesMutation()

const isOpen = ref(false)
const isRendering = ref(false)
const presetId = ref<LabelSheetPresetId>(DEFAULT_LABEL_SHEET_PRESET)
const confirmIssue = ref(false)

// Codes issued from this dialog. Kept locally so the sheet can use them at once,
// before the parent list has refetched and passed them back in as props.
const issuedCodes = ref(new Map<string, string>())

const count = computed(() => props.entities.length)

const resolved = computed(() => props.entities.map(entity => ({
  ...entity,
  barcode: entity.barcode ?? issuedCodes.value.get(entity.slug) ?? null
})))

const printable = computed(() => resolved.value.filter(entity => entity.barcode))
const missing = computed(() => resolved.value.filter(entity => !entity.barcode))

const labels = computed(() => printable.value.map(entity => ({
  code: entity.barcode!,
  caption: entity.name
})))

const pageCount = computed(() =>
  labels.value.length === 0
    ? 0
    : computeSheetLayout(LABEL_SHEET_PRESETS[presetId.value], labels.value.length).pages.length
)

const presetOptions = Object.values(LABEL_SHEET_PRESETS).map(preset => ({
  value: preset.id,
  label: preset.label
}))

function onPresetUpdate(value: unknown) {
  const resolvedValue = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : undefined
  if (typeof resolvedValue === 'string' && resolvedValue in LABEL_SHEET_PRESETS) {
    presetId.value = resolvedValue as LabelSheetPresetId
  }
}

// A different selection invalidates any issued-code bookkeeping and the opt-in.
watch(() => props.entities.map(entity => entity.slug).join('|'), () => {
  issuedCodes.value = new Map()
  confirmIssue.value = false
})

async function handleIssue() {
  if (missing.value.length === 0) return
  try {
    const result = await assignBarcodesAsync(
      missing.value.map(entity => ({ entityKind: entity.entityKind, slug: entity.slug }))
    )
    issuedCodes.value = new Map([...issuedCodes.value, ...result.issued])
    confirmIssue.value = false
  }
  catch {
    // The mutation surfaces the failure via a toast; keep the dialog open.
  }
}

async function render(action: 'preview' | 'download') {
  isRendering.value = true
  try {
    if (action === 'preview') await previewLabelSheet(labels.value, presetId.value)
    else await downloadLabelSheet(labels.value, presetId.value)
  }
  catch (error) {
    showError(
      error instanceof Error ? error.message : String(error),
      action === 'preview' ? 'Could not open the label sheet' : 'Could not download the label sheet'
    )
  }
  finally {
    isRendering.value = false
  }
}

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
  if (!open) {
    confirmIssue.value = false
    issuedCodes.value = new Map()
  }
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Print barcode labels"
    description="Arrange the barcodes of the selected entities on A4 sheets with cut marks."
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Labels' : `Labels (${count})`"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-printer"
      />
    </template>

    <div class="p-4 space-y-4">
      <p class="text-muted text-sm">
        <span class="font-semibold">{{ labels.length }}</span>
        label{{ labels.length === 1 ? '' : 's' }} will be printed on
        <span class="font-semibold">{{ pageCount }}</span>
        A4 page{{ pageCount === 1 ? '' : 's' }}.
      </p>

      <NFormField
        name="labelSize"
        label="Label size"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="presetId"
          :items="presetOptions"
          by="value"
          @update:model-value="onPresetUpdate"
        />
      </NFormField>

      <template v-if="missing.length > 0">
        <NAlert
          alert="soft-warning"
          title="Entities without a barcode"
          :description="`${missing.length} selected ${missing.length === 1 ? 'entity has' : 'entities have'} no barcode and will be skipped.`"
          icon
        />
        <NCheckbox
          :model-value="confirmIssue"
          :label="`Issue barcodes for these ${missing.length} entities`"
          @update:model-value="value => confirmIssue = value === true"
        />
        <NButton
          v-if="confirmIssue"
          :label="`Issue ${missing.length} barcode${missing.length === 1 ? '' : 's'}`"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-scan-barcode"
          :loading="isIssuing"
          @click="handleIssue"
        />
      </template>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Close"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <div class="flex flex-col gap-4 sm:flex-row">
          <NButton
            label="Preview PDF"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-eye"
            :loading="isRendering"
            :disabled="labels.length === 0"
            @click="render('preview')"
          />
          <NButton
            label="Download PDF"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-download"
            :loading="isRendering"
            :disabled="labels.length === 0"
            @click="render('download')"
          />
        </div>
      </div>
    </template>
  </NDialog>
</template>
