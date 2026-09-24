<script setup lang="ts">
import type { CloneInventorySource } from '~/utils/inventory/clone'
import {
  containerCloneFormValues,
  equipmentCloneFormValues,
  itemCloneFormValues
} from '~/utils/inventory/clone'

const props = defineProps<{
  source: CloneInventorySource
}>()

const isOpen = ref(false)

const sourceLabel = computed(() => {
  if (props.source.kind === 'equipment') return 'equipment'
  if (props.source.kind === 'container') return 'container'
  return 'item'
})

const dialogDescription = computed(() =>
  `Create a new ${sourceLabel.value} in the same parent using this ${sourceLabel.value}'s reusable configuration.`
)

const equipmentInitialValues = computed(() =>
  props.source.kind === 'equipment'
    ? equipmentCloneFormValues(props.source.entity)
    : undefined
)

const containerInitialValues = computed(() =>
  props.source.kind === 'container'
    ? containerCloneFormValues(props.source.entity)
    : undefined
)

const itemInitialValues = computed(() =>
  props.source.kind === 'item'
    ? itemCloneFormValues(props.source.entity)
    : undefined
)

const containerParent = computed<{ slug: string, kind: 'equipment' | 'container' } | null>(() => {
  if (props.source.kind !== 'container') return null
  const parent = props.source.entity.parentRef
  return parent && (parent.kind === 'equipment' || parent.kind === 'container')
    ? { slug: parent.slug, kind: parent.kind }
    : null
})

const itemParent = computed<{ slug: string, kind: 'equipment' | 'container' } | null>(() => {
  if (props.source.kind !== 'item') return null
  const parent = props.source.entity.parentRef
  return parent && (parent.kind === 'equipment' || parent.kind === 'container')
    ? { slug: parent.slug, kind: parent.kind }
    : null
})

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
}

function onCreated() {
  isOpen.value = false
}
</script>

<template>
  <NDialog
    :open="isOpen"
    :title="`Clone ${sourceLabel}`"
    :description="dialogDescription"
    :una="{ dialogContent: '!w-[95vw] !max-w-5xl max-h-[90vh] overflow-y-auto' }"
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Clone"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-copy-plus"
      />
    </template>

    <div
      v-if="isOpen"
      class="p-2 sm:p-4"
    >
      <StepperInventoryEquipmentAdd
        v-if="source.kind === 'equipment' && equipmentInitialValues"
        :room-slug="source.entity.parentRoom.slug"
        :initial-values="equipmentInitialValues"
        submit-label="Create clone"
        @created="onCreated"
      />

      <StepperInventoryContainerAdd
        v-else-if="source.kind === 'container' && containerParent && containerInitialValues"
        :parent-slug="containerParent.slug"
        :parent-kind="containerParent.kind"
        :initial-values="containerInitialValues"
        submit-label="Create clone"
        @created="onCreated"
      />

      <StepperInventoryItemAdd
        v-else-if="source.kind === 'item' && itemParent && itemInitialValues"
        :parent-slug="itemParent.slug"
        :parent-kind="itemParent.kind"
        :initial-values="itemInitialValues"
        submit-label="Create clone"
        @created="onCreated"
      />

      <NAlert
        v-else
        alert="border-warning"
        title="Clone unavailable"
        description="This entity has no current parent to receive the clone."
        icon="i-lucide-map-pin-off"
      />
    </div>

    <template #footer>
      <div class="flex justify-start w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
