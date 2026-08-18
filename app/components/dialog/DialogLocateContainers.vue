<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayContainer } from '~~/types/inventory'
import { containerMoveTargetsBatchQuery } from '~/utils/queries/inventory/containers'
import { locateContainer as useLocateContainersMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  containers: DisplayContainer[]
}>()

const emit = defineEmits<{ done: [] }>()

const { showError } = useFirnToast()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

const isOpen = ref(false)
// When true, the server picks the first suitable free location; otherwise the user chooses one.
const autoSelect = ref(true)
// Value encodes both parent kind and slug ("equipment:eq-abc").
const selectedTarget = ref<string | undefined>()

const slugs = computed(() => props.containers.map(c => c.slug))
const count = computed(() => props.containers.length)

// Only fetch candidate destinations while the dialog is open and the user wants to pick manually.
const { state: targetsState, asyncStatus: targetsStatus } = useQueryColada(
  () => ({ ...containerMoveTargetsBatchQuery(slugs.value), enabled: isOpen.value && !autoSelect.value })
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

const isLocateDisabled = computed(() => {
  if (count.value === 0) return true
  if (autoSelect.value) return false
  return isLoadingTargets.value || targetOptions.value.length === 0 || selectedTarget.value == null
})

watch([isOpen, autoSelect], () => {
  if (isOpen.value && !autoSelect.value && !selectedTarget.value) {
    selectedTarget.value = targetOptions.value[0]?.value
  }
})

watch(targetOptions, (options) => {
  if (!isOpen.value || autoSelect.value) return
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

const { mutateAsync: locateContainersAsync, isLoading } = useLocateContainersMutation()

async function handleLocate() {
  let newParentSlug: string | null = null
  let newParentKind: 'equipment' | 'container' | null = null

  if (!autoSelect.value) {
    if (!selectedTarget.value) {
      showError('Please select a destination location.', 'Locate containers')
      return
    }
    const separatorIndex = selectedTarget.value.indexOf(':')
    const kind = selectedTarget.value.slice(0, separatorIndex)
    const slug = selectedTarget.value.slice(separatorIndex + 1)
    if ((kind !== 'equipment' && kind !== 'container') || !slug) {
      showError('Please select a valid destination location.', 'Locate containers')
      return
    }
    newParentKind = kind
    newParentSlug = slug
  }

  try {
    const result = await locateContainersAsync({
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
    title="Locate containers"
    description="Return lost containers to storage — pick a destination or let the system choose one."
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Locate' : `Locate (${count})`"
        size="sm"
        btn="soft-success hover:outline-success"
        leading="i-lucide-map-pin"
      />
    </template>

    <div class="p-4 space-y-4">
      <p class="text-muted text-sm">
        Locating <span class="font-semibold">{{ count }}</span> lost container{{ count === 1 ? '' : 's' }} and returning
        {{ count === 1 ? 'it' : 'them' }} to <span class="font-semibold">available</span> status.
      </p>

      <NFormGroup
        label="Auto-select location"
        description="Let the system place the container(s) in the first suitable free slot."
        :una="{ formGroupLabel: FORM_LABEL_STYLE, formGroupDescription: 'text-muted' }"
      >
        <NSwitch v-model="autoSelect" />
      </NFormGroup>

      <template v-if="!autoSelect">
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
          label="Destination location"
          :una="{ formLabel: FORM_LABEL_STYLE }"
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
          description="Fetching locations that can accept the selected containers."
          icon="i-lucide-loader-2"
        />
      </template>
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
          :label="`Locate ${count} container${count === 1 ? '' : 's'}`"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-map-pin"
          :disabled="isLocateDisabled"
          :loading="isLoading"
          @click="handleLocate"
        />
      </div>
    </template>
  </NDialog>
</template>
