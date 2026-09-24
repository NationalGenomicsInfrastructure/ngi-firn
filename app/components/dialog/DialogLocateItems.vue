<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayInventoryItem } from '~~/types/inventory'
import { itemMoveTargetsBatchQuery } from '~/utils/queries/inventory/items'
import { locateItem as useLocateItemsMutation } from '~/utils/mutations/inventory/items'
import { formatTemperature } from '~/utils/inventory/temperature'

const props = defineProps<{
  items: DisplayInventoryItem[]
}>()

const emit = defineEmits<{ done: [] }>()

const { showError } = useFirnToast()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

const isOpen = ref(false)
// Value encodes both parent kind and slug ("equipment:eq-abc").
const selectedTarget = ref<string | undefined>()

const slugs = computed(() => props.items.map(c => c.slug))
const count = computed(() => props.items.length)

// Item location requires an explicit destination parent.
const { state: targetsState, asyncStatus: targetsStatus } = useQueryColada(
  () => ({ ...itemMoveTargetsBatchQuery({ itemSlug: slugs.value }), enabled: isOpen.value })
)

const targetOptions = computed(() =>
  targetsState.value.status === 'success'
    ? targetsState.value.data.map(target => ({
        value: `${target.kind}:${target.slug}`,
        label: `${target.name} · ${target.free ?? 'Unlimited'} free · ${formatTemperature(target.temperatureCategory, target.temperatureCelsius)} · ${target.kind === 'equipment' ? 'Equipment' : 'Container'}`
      }))
    : []
)

const isLoadingTargets = computed(() => targetsStatus.value === 'loading')

const isLocateDisabled = computed(() => {
  if (count.value === 0) return true
  return isLoadingTargets.value || targetOptions.value.length === 0 || selectedTarget.value == null
})

watch(isOpen, () => {
  if (isOpen.value && !selectedTarget.value) {
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

const { mutateAsync: locateItemsAsync, isLoading } = useLocateItemsMutation()

async function handleLocate() {
  let newParentSlug: string | null = null
  let newParentKind: 'equipment' | 'container' | null = null

  if (!selectedTarget.value) {
    showError('Please select a destination location.', 'Locate items')
    return
  }
  const separatorIndex = selectedTarget.value.indexOf(':')
  const kind = selectedTarget.value.slice(0, separatorIndex)
  const slug = selectedTarget.value.slice(separatorIndex + 1)
  if ((kind !== 'equipment' && kind !== 'container') || !slug) {
    showError('Please select a valid destination location.', 'Locate items')
    return
  }
  newParentKind = kind
  newParentSlug = slug

  try {
    const result = await locateItemsAsync({
      itemSlug: slugs.value,
      newParentSlug: newParentSlug!,
      newParentKind: newParentKind!
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
    :title="`Locate item${count === 1 ? '' : 's'}`"
    :description="`Return the lost item${count === 1 ? '' : 's'} to storage by selecting a destination.`"
    :una="{ dialogContent: '!w-[90vw] !max-w-[42rem]' }"
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
        Locating <span class="font-semibold">{{ count }}</span> lost item{{ count === 1 ? '' : 's' }} and returning
        {{ count === 1 ? 'it' : 'them' }} to <span class="font-semibold">available</span> status.
      </p>

      <NAlert
        v-if="!isLoadingTargets && targetOptions.length === 0"
        alert="border-warning"
        title="No destination available"
        description="No single equipment or item has enough free slots."
        icon="i-lucide-package-x"
      />

      <NFormField
        v-else-if="!isLoadingTargets"
        name="targetParent"
        label="Destination location"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NSelect
          class="w-full"
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
        description="Fetching locations that can accept the selected items."
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
          :label="`Place ${count} item${count === 1 ? '' : 's'}`"
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
