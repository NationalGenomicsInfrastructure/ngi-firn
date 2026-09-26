<script setup lang="ts">
import {
  BARCODE_ACTION_MNEMONICS,
  BARCODE_FOR_ACTION
} from '~~/schemas/inventory/barcode'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

definePageMeta({
  layout: 'private'
})

const { previewActionSheet, downloadActionSheet } = useInventoryBarcode()
const { showError } = useFirnToast()

// The action cards are deterministic and backed by no documents, so the list is
// derived straight from the shared barcode module rather than fetched.
const actionCards = (Object.keys(BARCODE_ACTION_MNEMONICS) as InventoryActionType[]).map((action) => {
  const meta = getActionTypeMeta(action)
  return {
    action,
    code: BARCODE_FOR_ACTION[action],
    label: meta.label,
    icon: meta.icon
  }
})

const isRendering = ref(false)

async function handlePreview() {
  isRendering.value = true
  try {
    await previewActionSheet()
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
    await downloadActionSheet()
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
      title="Action barcodes"
      description="Print the reference sheet of action cards. Include one card in a scanned set to say what should happen to the entities scanned with it."
    />

    <NCard
      card="soft-gray"
      class="mt-6"
      :una="{ cardContent: 'space-y-4' }"
    >
      <div class="flex flex-wrap gap-2">
        <NButton
          label="Preview PDF"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-eye"
          :loading="isRendering"
          @click="handlePreview()"
        />
        <NButton
          label="Download PDF"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-download"
          :loading="isRendering"
          @click="handleDownload()"
        />
      </div>
      <p class="text-sm text-muted">
        The sheet stays valid indefinitely — these codes are deterministic and never
        expire, so a single print can be reused. Preview opens the PDF in a new tab,
        from which it can also be printed.
      </p>
    </NCard>

    <NCard
      card="outline-gray"
      class="mt-6"
      title="Included action cards"
      :una="{ cardDescription: 'text-muted' }"
    >
      <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="card in actionCards"
          :key="card.action"
          class="flex items-center gap-3 rounded-md border border-gray-200 dark:border-gray-800 p-3"
        >
          <NIcon
            :name="card.icon"
            class="text-primary-500 text-lg shrink-0"
          />
          <div class="min-w-0">
            <p class="font-medium">
              {{ card.label }}
            </p>
            <NBadge
              badge="outline"
              :label="card.code"
              class="mt-1 font-mono"
            />
          </div>
        </div>
      </div>
    </NCard>
  </main>
</template>
