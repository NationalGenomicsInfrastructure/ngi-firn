<script setup lang="ts">
import {
  BARCODE_ACTION_MNEMONICS
} from '~~/schemas/inventory/barcode'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

definePageMeta({
  layout: 'private'
})

const { previewActionSheet, downloadActionSheet } = useInventoryBarcode()
const { showError } = useFirnToast()

// The action cards are deterministic and backed by no documents, so the list is
// derived straight from the shared barcode module rather than fetched. Selection is
// intentionally ephemeral component state — nothing is persisted.
const allActions = Object.keys(BARCODE_ACTION_MNEMONICS) as InventoryActionType[]

const toggleItems = allActions.map((action) => {
  const meta = getActionTypeMeta(action)
  return {
    value: action,
    label: meta.progressive,
    leading: meta.icon
  }
})

// Every card is included by default so the common "print them all" case is one click.
const selectedActions = ref<InventoryActionType[]>([...allActions])

const hasSelection = computed(() => selectedActions.value.length > 0)

function selectAll() {
  selectedActions.value = [...allActions]
}

function clearSelection() {
  selectedActions.value = []
}

const isRendering = ref(false)

async function handlePreview() {
  isRendering.value = true
  try {
    await previewActionSheet(selectedActions.value)
  }
  catch (error) {
    showError(error instanceof Error ? error.message : String(error), 'Could not open the action sheet')
  }
  finally {
    isRendering.value = false
  }
}

async function handleDownload() {
  isRendering.value = true
  try {
    await downloadActionSheet(selectedActions.value)
  }
  catch (error) {
    showError(error instanceof Error ? error.message : String(error), 'Could not download the action sheet')
  }
  finally {
    isRendering.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8 lg:px-8 sm:px-6">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back to inventory"
        to="/inventory"
      />
    </div>

    <PageTitle
      title="Print action barcodes"
      description="Create a reference sheet of action barcodes."
    />

    <NCard
      card="outline-gray"
      class="mt-6"
      title="Action barcodes to print"
      description="Including such a barcode in a scanned set allows to control the actions applied to the scanned entities. The sheet stays valid indefinitely."
      :una="{ cardDescription: 'text-muted' }"
    >
      <NToggleGroup
        v-model="selectedActions"
        class="mt-4 flex flex-wrap gap-2"
        type="multiple"
        :items="toggleItems"
        toggle-on="solid-primary"
        toggle-off="soft-gray"
        :_toggle-group-item="{
          icon: false,
          square: false
        }"
      />

      <div class="mt-4 flex flex-wrap items-center gap-2 mt-8 mb-16">
        <NButton
          label="Select all"
          btn="ghost-gray"
          size="sm"
          leading="i-lucide-check-check"
          :disabled="selectedActions.length === toggleItems.length"
          @click="selectAll()"
        />
        <NButton
          label="Clear"
          btn="ghost-gray"
          size="sm"
          leading="i-lucide-x"
          :disabled="!hasSelection"
          @click="clearSelection()"
        />
        <p
          v-if="!hasSelection"
          class="text-sm text-error"
        >
          Select at least one action card below to enable printing.
        </p>
        <p
          v-else
          class="text-sm text-muted"
        >
          {{ selectedActions.length }} of {{ toggleItems.length }} selected
        </p>
      </div>

      <div class="flex flex-col flex-col-reverse gap-4 mt-8 sm:mt-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NButton
          label="Preview PDF"
          btn="soft-primary hover:outline-primary size-md"
          leading="i-lucide-eye"
          :loading="isRendering"
          :disabled="!hasSelection"
          @click="handlePreview()"
        />
        <NButton
          label="Download PDF"
          btn="soft-primary hover:outline-primary size-md"
          leading="i-lucide-download"
          :loading="isRendering"
          :disabled="!hasSelection"
          @click="handleDownload()"
        />
      </div>
    </NCard>
  </main>
</template>
