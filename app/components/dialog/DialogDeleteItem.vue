<script setup lang="ts">
import type { DisplayInventoryItem } from '~~/types/inventory'
import { deleteItem as useDeleteItemsMutation } from '~/utils/mutations/inventory/items'

const props = defineProps<{
  items: DisplayInventoryItem[]
}>()

const emit = defineEmits<{ done: [] }>()

const isOpen = ref(false)

const { mutateAsync: deleteItemsAsync, isLoading } = useDeleteItemsMutation()

const count = computed(() => props.items.length)

async function handleDelete() {
  if (count.value === 0) return

  try {
    await deleteItemsAsync({
      itemSlug: props.items.map(c => c.slug),
      itemNames: props.items.map(c => c.name),
      // Per-item parent context lets the mutation target the right list caches.
      parents: props.items
        .filter(c => c.parentRef?.slug && (c.parentRef.kind === 'equipment' || c.parentRef.kind === 'container'))
        .map(c => ({ slug: c.parentRef!.slug, kind: c.parentRef!.kind as 'equipment' | 'container' }))
    })
    isOpen.value = false
    emit('done')
  }
  catch {
    // The mutation surfaces the failure via a toast; keep the dialog open.
  }
}

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Delete items"
    description="Are you sure you want to delete the selected items?"
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Delete' : `Delete (${count})`"
        size="sm"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This will permanently remove <span class="font-semibold text-error">{{ count }}</span> item{{ count === 1 ? '' : 's' }} from inventory.
      </p>
      <p class="text-muted">
        A item can only be deleted when it holds no child items or items. Any that still
        contain inventory are skipped and reported.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NButton
          :label="`Delete ${count} item${count === 1 ? '' : 's'}`"
          btn="soft-error hover:outline-error"
          leading="i-lucide-trash-2"
          :loading="isLoading"
          :disabled="count === 0"
          @click="handleDelete"
        />
      </div>
    </template>
  </NDialog>
</template>
