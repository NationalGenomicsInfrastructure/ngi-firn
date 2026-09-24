<script setup lang="ts">
import { assignBarcode as useAssignBarcodeMutation } from '~/utils/mutations/inventory/barcodes'
import type { BarcodeEntityKind } from '~~/schemas/inventory/barcode'

const props = defineProps<{
  entityKind: BarcodeEntityKind
  slug: string
  name: string
  barcode: string | null
}>()

const isOpen = ref(false)
const confirmReissue = ref(false)

const { previewDataUrl, previewLabel, downloadLabel, describeCode } = useInventoryBarcode()
const { mutateAsync: assignBarcodeAsync, isLoading } = useAssignBarcodeMutation()

const description = computed(() => describeCode(props.barcode))

/*
 * The rendered symbol, produced lazily. JsBarcode needs a DOM canvas, so this only
 * ever runs client-side and only while the dialog is open.
 */
const symbolDataUrl = ref<string | null>(null)
const renderError = ref<string | null>(null)

/*
 * Rendering is async, so a slow render started for an earlier barcode could resolve
 * after a newer one and overwrite it — visible when re-issuing, where the old image
 * would reappear under the new code. A generation counter discards stale results.
 */
let renderGeneration = 0

watchEffect(async () => {
  const generation = ++renderGeneration

  if (!isOpen.value || !props.barcode) {
    symbolDataUrl.value = null
    renderError.value = null
    return
  }

  try {
    const dataUrl = await previewDataUrl(props.barcode)
    if (generation !== renderGeneration) return
    renderError.value = null
    symbolDataUrl.value = dataUrl
  }
  catch (error) {
    if (generation !== renderGeneration) return
    // A code that cannot be encoded must be visible as such, not silently blank.
    symbolDataUrl.value = null
    renderError.value = error instanceof Error ? error.message : String(error)
  }
})

const caption = computed(() => `${props.name} (${props.slug})`)

async function handleAssign() {
  try {
    await assignBarcodeAsync({
      entityKind: props.entityKind,
      slug: props.slug,
      replaceExisting: Boolean(props.barcode)
    })
    confirmReissue.value = false
  }
  catch {
    // The mutation surfaces the failure via a toast; keep the dialog open.
  }
}

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
  if (!open) confirmReissue.value = false
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Barcode"
    :description="`Barcode label for ${name}.`"
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Barcode"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-scan-barcode"
      />
    </template>

    <div class="grid gap-4 p-4">
      <template v-if="barcode">
        <div class="flex flex-col items-center gap-2">
          <img
            v-if="symbolDataUrl"
            :src="symbolDataUrl"
            :alt="`Barcode ${barcode}`"
            class="max-w-full bg-white rounded-md p-2"
          >
          <p
            v-else-if="renderError"
            class="text-sm text-error"
          >
            This code could not be rendered: {{ renderError }}
          </p>
          <NSkeleton
            v-else
            class="h-20 w-full"
          />
        </div>

        <div class="flex items-center justify-center gap-2">
          <NBadge
            v-if="description.isExternal"
            badge="outline"
            label="External label"
          />
          <NBadge
            v-else-if="description.isFirnIssued"
            badge="solid-primary"
            label="Firn barcode"
          />
          <NBadge
            v-else
            badge="solid-error"
            label="Unrecognised"
          />
        </div>

        <p
          v-if="description.isExternal"
          class="text-sm text-muted text-center"
        >
          This label was supplied externally rather than issued by Firn. It still
          resolves when scanned.
        </p>

        <NSeparator />

        <div class="flex flex-wrap justify-center gap-2">
          <NButton
            label="Preview label"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-eye"
            @click="previewLabel(barcode, caption)"
          />
          <NButton
            label="Download label"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-download"
            @click="downloadLabel(barcode, caption)"
          />
        </div>

        <NSeparator />

        <div class="grid gap-2">
          <p class="text-sm text-muted">
            Re-issuing generates a new code. The label already on this
            {{ entityKind }} will stop working and must be replaced.
          </p>
          <NCheckbox
            :model-value="confirmReissue"
            label="I understand the printed label will stop working"
            @update:model-value="value => confirmReissue = value === true"
          />
        </div>
      </template>

      <template v-else>
        <p class="text-muted">
          This {{ entityKind }} has no barcode yet. Issuing one lets it be scanned
          for check-out, return and relocation.
        </p>
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
        <NButton
          :label="barcode ? 'Re-issue barcode' : 'Issue barcode'"
          :btn="barcode ? 'soft-error hover:outline-error' : 'soft-primary hover:outline-primary'"
          leading="i-lucide-scan-barcode"
          :loading="isLoading"
          :disabled="Boolean(barcode) && !confirmReissue"
          @click="handleAssign"
        />
      </div>
    </template>
  </NDialog>
</template>
