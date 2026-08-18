<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayContainer } from '~~/types/inventory'
import { containerMoveTargetsBatchQuery } from '~/utils/queries/inventory/containers'
import { moveContainer as useMoveContainersMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  containers: DisplayContainer[]
}>()

const emit = defineEmits<{ done: [] }>()

const { showError } = useFirnToast()

const isOpen = ref(false)
// Value encodes both parent kind and slug ("equipment:eq-abc"), since the move mutation needs
// newParentKind and equipment/container slugs share no guaranteed namespace.
const selectedTarget = ref<string | undefined>()

const slugs = computed(() => props.containers.map(c => c.slug))
const count = computed(() => props.containers.length)

// Only fetch candidate destinations while the dialog is open — avoids a query on every
// selection change in the underlying table.
const { state: targetsState, asyncStatus: targetsStatus } = useQueryColada(
  () => ({ ...containerMoveTargetsBatchQuery(slugs.value), enabled: isOpen.value })
)

const targetOptions = computed(() =>
  targetsState.value.status === 'success'
    ? targetsState.value.data.map(target => ({
        value: `${target.kind}:${target.slug}`,
        label: `${target.name} (${target.slug}) · ${target.free} free · ${target.kind === 'equipment' ? 'Equipment' : 'Container'}`
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

const { mutateAsync: moveContainersAsync, isLoading } = useMoveContainersMutation()

async function handleMove() {
  if (!selectedTarget.value) {
    showError('Please select a destination parent.', 'Move containers')
    return
  }

  const separatorIndex = selectedTarget.value.indexOf(':')
  const newParentKind = selectedTarget.value.slice(0, separatorIndex)
  const newParentSlug = selectedTarget.value.slice(separatorIndex + 1)

  if ((newParentKind !== 'equipment' && newParentKind !== 'container') || !newParentSlug) {
    showError('Please select a valid destination parent.', 'Move containers')
    return
  }

  try {
    const result = await moveContainersAsync({
      containerSlug: slugs.value,
      containerNames: props.containers.map(c => c.name),
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
    title="Move containers"
    description="Select a destination that accepts every selected container."
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
        Moving <span class="font-semibold">{{ count }}</span> container{{ count === 1 ? '' : 's' }} to a single shared destination.
      </p>

      <NAlert
        v-if="!isLoadingTargets && targetOptions.length === 0"
        alert="border-warning"
        title="No destination available"
        description="No single equipment or container can accept all selected containers with enough free slots."
        icon="i-lucide-package-x"
      />

      <NFormField
        v-else-if="!isLoadingTargets"
        name="targetParent"
        label="Destination parent"
        :una="{ formLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSelect
          :model-value="selectedTarget"
          :items="targetOptions"
          by="value"
          @update:model-value="onTargetUpdate"
        />
      </NFormField>

      <NAlert
        v-else
        alert="border-gray"
        title="Loading destinations..."
        description="Fetching parents that can accept the selected containers."
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
          :label="`Move ${count} container${count === 1 ? '' : 's'}`"
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
