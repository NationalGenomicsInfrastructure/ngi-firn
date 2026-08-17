<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'
import { deleteContainer as useDeleteContainerMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  container: DisplayContainer
}>()

const { deleteContainer } = useDeleteContainerMutation()

// The parent context lets the mutation locate the right list cache for optimistic removal.
// A container parent is always either equipment or another container.
const parentKind = computed<'equipment' | 'container' | undefined>(() => {
  const kind = props.container.parentRef?.kind
  if (kind === 'equipment') return 'equipment'
  if (kind === 'container') return 'container'
  return undefined
})

function handleDelete() {
  deleteContainer({
    containerSlug: [props.container.slug],
    containerNames: [props.container.name],
    parents: parentKind.value && props.container.parentRef?.slug
      ? [{ slug: props.container.parentRef.slug, kind: parentKind.value }]
      : []
  })
}
</script>

<template>
  <NDialog
    title="Delete container"
    description="Are you sure you want to delete this container?"
  >
    <template #trigger>
      <NButton
        label="Delete"
        size="sm"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This will permanently remove <span class="font-semibold text-error">{{ container.name }}</span> ({{ container.slug }}) from inventory.
      </p>
      <p class="text-muted">
        A container can only be deleted when it holds no child containers or items.
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
        <NDialogClose>
          <NButton
            label="Delete container"
            btn="soft-error hover:outline-error"
            leading="i-lucide-trash-2"
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
