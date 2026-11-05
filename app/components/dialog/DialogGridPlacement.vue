<script setup lang="ts">
import type { GridDragPayload } from '~/composables/useGridDrag'
import { gridLabel, type GridCoordinate } from '~/utils/inventory/grid'
import { moveContainer as useMoveContainerMutation } from '~/utils/mutations/inventory/containers'
import { moveItem as useMoveItemMutation } from '~/utils/mutations/inventory/items'

/*
 * Confirmation for a drag-and-drop placement: moves the dragged container/item into the exact
 * cell of `parentSlug`. Covers re-slotting inside the same grid and dropping a child from
 * elsewhere (e.g. a list) onto a cell. Controlled via `v-model:open`.
 */
const props = defineProps<{
  payload: GridDragPayload | null
  parentSlug: string
  position: GridCoordinate | null
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { mutateAsync: moveContainerAsync } = useMoveContainerMutation()
const { mutateAsync: moveItemAsync } = useMoveItemMutation()
const isSubmitting = ref(false)

const targetLabel = computed(() =>
  props.position ? gridLabel(props.position.row, props.position.column, props.position.level) : ''
)
const isReslot = computed(() => props.payload?.fromParentSlug === props.parentSlug)

async function confirm() {
  if (!props.payload || !props.position) return
  const position = {
    row: props.position.row,
    column: props.position.column,
    level: props.position.level,
    label: targetLabel.value
  }
  isSubmitting.value = true
  try {
    const result = props.payload.kind === 'container'
      ? await moveContainerAsync({
          containerSlug: [props.payload.slug],
          containerNames: [props.payload.label],
          newParentSlug: props.parentSlug,
          newParentKind: 'container',
          position
        })
      : await moveItemAsync({
          itemSlug: [props.payload.slug],
          newParentSlug: props.parentSlug,
          newParentKind: 'container',
          position
        })
    if (result && result.length > 0) isOpen.value = false
  }
  catch {
    // The mutation's onError already surfaced a toast and restored the optimistic state.
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <NDialog
    v-model:open="isOpen"
    :title="isReslot ? 'Move to another slot' : 'Place in this grid'"
    description="Confirm the new position."
  >
    <div class="p-4 space-y-2">
      <p class="text-sm">
        Move
        <span class="font-semibold">{{ payload?.label }}</span>
        {{ isReslot ? 'to slot' : 'into this grid, slot' }}
        <span class="font-semibold text-success">{{ targetLabel }}</span>?
      </p>
      <p class="text-xs text-muted">
        The move is recorded in the action log.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NButton
          label="Cancel"
          btn="soft-gray hover:outline-gray"
          leading="i-lucide-x"
          @click="isOpen = false"
        />
        <NButton
          label="Confirm move"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-combine"
          :loading="isSubmitting"
          @click="confirm"
        />
      </div>
    </template>
  </NDialog>
</template>
