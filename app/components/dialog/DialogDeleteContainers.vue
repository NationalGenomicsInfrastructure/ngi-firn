<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'
import { deleteContainer as useDeleteContainersMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  containers: DisplayContainer[]
}>()

const emit = defineEmits<{ done: [] }>()

const isOpen = ref(false)

const { mutateAsync: deleteContainersAsync, isLoading } = useDeleteContainersMutation()

const count = computed(() => props.containers.length)

async function handleDelete() {
  if (count.value === 0) return

  try {
    await deleteContainersAsync({
      containerSlug: props.containers.map(c => c.slug),
      containerNames: props.containers.map(c => c.name),
      // Per-container parent context lets the mutation target the right list caches.
      parents: props.containers
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
    :model-value="isOpen"
    title="Delete containers"
    description="Are you sure you want to delete the selected containers?"
    @update:model-value="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="`Delete (${count})`"
        size="sm"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This will permanently remove <span class="font-semibold text-error">{{ count }}</span> container{{ count === 1 ? '' : 's' }} from inventory.
      </p>
      <p class="text-muted">
        A container can only be deleted when it holds no child containers or items. Any that still
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
          :label="`Delete ${count} container${count === 1 ? '' : 's'}`"
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
