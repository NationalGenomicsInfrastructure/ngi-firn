<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayInventoryItem } from '~~/types/inventory'
import { itemMoveTargetsBatchQuery } from '~/utils/queries/inventory/items'
import { moveItem as useMoveItemsMutation } from '~/utils/mutations/inventory/items'

const props = defineProps<{
  items: DisplayInventoryItem[]
}>()

const emit = defineEmits<{ done: [] }>()

const { showError } = useFirnToast()

const isOpen = ref(false)
// Value encodes both parent kind and slug ("equipment:eq-abc"), since the move mutation needs
// newParentKind and equipment/item slugs share no guaranteed namespace.
const selectedTarget = ref<string | undefined>()
const showAllClassifications = ref(false)

const slugs = computed(() => props.items.map(c => c.slug))
const count = computed(() => props.items.length)

// Only fetch candidate destinations while the dialog is open — avoids a query on every
// selection change in the underlying table.
const { state: targetsState, asyncStatus: targetsStatus } = useQueryColada(
  () => ({
    ...itemMoveTargetsBatchQuery({
      itemSlug: slugs.value,
      showAllClassifications: showAllClassifications.value
    }),
    enabled: isOpen.value
  })
)

const targetOptions = computed(() =>
  targetsState.value.status === 'success'
    ? targetsState.value.data.map(target => ({
        value: `${target.kind}:${target.slug}`,
        label: `${target.name} · ${target.free ?? 'Unlimited'} free · ${target.temperatureCelsius == null ? 'No temperature' : `${target.temperatureCelsius} °C`} · ${target.kind === 'equipment' ? 'Equipment' : 'Container'}`
      }))
    : []
)

const isLoadingTargets = computed(() => targetsStatus.value === 'loading')

const isMoveDisabled = computed(() =>
  isLoadingTargets.value
  || targetOptions.value.length === 0
  || selectedTarget.value == null
)

watch(isOpen, (open) => {
  if (open) {
    selectedTarget.value = targetOptions.value[0]?.value
  }
})

watch(targetOptions, (options) => {
  if (!isOpen.value) return
  if (!selectedTarget.value && options.length > 0) {
    selectedTarget.value = options[0]?.value
  }
})

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
}

function onTargetUpdate(value: unknown) {
  if (typeof value === 'string') {
    selectedTarget.value = value
    return
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const optionValue = (value as { value?: unknown }).value
    if (typeof optionValue === 'string') {
      selectedTarget.value = optionValue
    }
  }
}

const { mutateAsync: moveItemsAsync, isLoading } = useMoveItemsMutation()

async function handleMove() {
  if (!selectedTarget.value) {
    showError('Please select a destination parent.', 'Move items')
    return
  }

  const separatorIndex = selectedTarget.value.indexOf(':')
  const newParentKind = selectedTarget.value.slice(0, separatorIndex)
  const newParentSlug = selectedTarget.value.slice(separatorIndex + 1)

  if ((newParentKind !== 'equipment' && newParentKind !== 'container') || !newParentSlug) {
    showError('Please select a valid destination parent.', 'Move items')
    return
  }

  try {
    const result = await moveItemsAsync({
      itemSlug: slugs.value,
      newParentSlug,
      newParentKind
      // position omitted: batches auto-place into the first free slots.
    })

    if (result) {
      isOpen.value = false
      emit('done')
    }
  }
  catch {
    // The mutation surfaces the failure via a toast; keep the dialog open.
  }
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Move items"
    description="Select a destination that accepts every selected item."
    :una="{ dialogContent: '!w-[90vw] !max-w-[42rem]' }"
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Move' : `Move (${count})`"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-combine"
      />
    </template>

    <div class="p-4 space-y-4">
      <p class="text-muted text-sm">
        Moving <span class="font-semibold">{{ count }}</span> item{{ count === 1 ? '' : 's' }} to a single shared destination.
      </p>

      <NAlert
        v-if="!isLoadingTargets && targetOptions.length === 0"
        alert="border-warning"
        title="No destination available"
        description="No single equipment or item can accept all selected items with enough free slots."
        icon="i-lucide-package-x"
      />

      <NFormField
        v-else-if="!isLoadingTargets"
        name="targetParent"
        label="Destination parent"
        :una="{ formLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSelect
          class="w-full"
          :model-value="selectedTarget"
          :items="targetOptions"
          by="value"
          @update:model-value="onTargetUpdate"
        />
      </NFormField>

      <NFormGroup
        v-if="!isLoadingTargets"
        label="Classification"
        :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSwitch
          v-model="showAllClassifications"
          label="Show all classifications"
        />
      </NFormGroup>

      <NAlert
        v-else
        alert="border-gray"
        title="Loading destinations..."
        description="Fetching parents that can accept the selected items."
        icon="i-lucide-loader-2"
      />
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
          :label="`Move ${count} item${count === 1 ? '' : 's'}`"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-combine"
          :disabled="isMoveDisabled"
          :loading="isLoading"
          @click="handleMove"
        />
      </div>
    </template>
  </NDialog>
</template>
