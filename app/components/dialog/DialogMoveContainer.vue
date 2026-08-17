<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayContainer } from '~~/types/inventory'
import { containerMoveTargetsQuery } from '~/utils/queries/inventory/containers'
import { moveContainer as useMoveContainerMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  container: DisplayContainer
}>()

const { showError } = useFirnToast()

const isDialogOpen = ref(false)
// Value encodes both parent kind and slug ("equipment:eq-abc"), since the move mutation
// needs newParentKind and equipment/container slugs share no guaranteed namespace.
const selectedTarget = ref<string | undefined>()

const { state: targetsState, asyncStatus: targetsStatus } = useQueryColada(
  () => containerMoveTargetsQuery(props.container.slug)
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

watch(isDialogOpen, (isOpen) => {
  if (isOpen) {
    selectedTarget.value = targetOptions.value[0]?.value
  }
})

watch(targetOptions, (options) => {
  if (!isDialogOpen.value) {
    return
  }

  if (!selectedTarget.value && options.length > 0) {
    const firstOption = options[0]
    if (firstOption) {
      selectedTarget.value = firstOption.value
    }
  }
})

function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
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

const { mutateAsync: moveContainerAsync } = useMoveContainerMutation()

async function handleMove() {
  if (!selectedTarget.value) {
    showError('Please select a destination parent.', 'Move container')
    return
  }

  const separatorIndex = selectedTarget.value.indexOf(':')
  const newParentKind = selectedTarget.value.slice(0, separatorIndex)
  const newParentSlug = selectedTarget.value.slice(separatorIndex + 1)

  if ((newParentKind !== 'equipment' && newParentKind !== 'container') || !newParentSlug) {
    showError('Please select a valid destination parent.', 'Move container')
    return
  }

  const result = await moveContainerAsync({
    containerSlug: [props.container.slug],
    containerNames: [props.container.name],
    newParentSlug,
    newParentKind
    // position omitted: grid parents auto-place the container into the first free slot.
  })

  if (result && result.length > 0) {
    isDialogOpen.value = false
  }
}
</script>

<template>
  <NDialog
    :model-value="isDialogOpen"
    title="Move container"
    description="Select a destination that accepts this container type."
    @update:model-value="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Move"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-combine"
      />
    </template>

    <div class="p-4 space-y-4">
      <NAlert
        v-if="!isLoadingTargets && targetOptions.length === 0"
        alert="border-warning"
        title="No destination available"
        description="No other equipment or container accepts this container type with a free slot."
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
        description="Fetching parents that can accept this container."
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
          label="Move container"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-combine"
          :disabled="isMoveDisabled"
          @click="handleMove"
        />
      </div>
    </template>
  </NDialog>
</template>
