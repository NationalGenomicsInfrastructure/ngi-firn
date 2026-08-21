<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType } from '~~/schemas/inventory/metadata'
import { allowedActionsForStatus, isAlterAction } from '~~/schemas/inventory/metadata'
import { FLAG_META } from '~/utils/inventory/actionLog'
import { alterContainer as useAlterContainersMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  containers: DisplayContainer[]
}>()

const emit = defineEmits<{ done: [] }>()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

// Preferred display order of the lifecycle actions this dialog can perform. The actual
// availability is decided per-selection by the status state machine (see actionOptions);
// `locate` is intentionally excluded here — it needs a destination and has its own dialog.
const ACTION_ORDER: InventoryActionType[] = [
  'checkout',
  'return',
  'reserve',
  'unreserve',
  'mark_expired',
  'post_missing',
  'flag',
  'unflag',
  'dispose',
  'note'
]

// ACTION_TYPE_META labels are past-tense (they describe log entries); when choosing an action
// to perform, present-tense imperative reads better, so derive labels from the enum values.
function actionLabel(action: InventoryActionType): string {
  const words = action.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const isOpen = ref(false)
const selectedAction = ref<InventoryActionType>('note')
const selectedFlag = ref<InventoryFlagType>('info')
const logComment = ref('')

const count = computed(() => props.containers.length)
const requiresFlag = computed(() => selectedAction.value === 'flag' || selectedAction.value === 'unflag')
const isDispose = computed(() => selectedAction.value === 'dispose')

// Actions permitted for the WHOLE selection: the intersection of each container's
// status-allowed alter actions. A mixed-status selection only offers what they all share.
const commonAllowedActions = computed<Set<InventoryActionType>>(() => {
  if (props.containers.length === 0) return new Set<InventoryActionType>()
  let common: InventoryActionType[] | null = null
  for (const container of props.containers) {
    const allowed = allowedActionsForStatus(container.status).filter(isAlterAction)
    common = common === null
      ? [...allowed]
      : common.filter(action => allowed.includes(action))
  }
  return new Set<InventoryActionType>(common ?? [])
})

// Flags currently present across the selected containers — you can only remove a flag that exists.
const availableFlags = computed<InventoryFlagType[]>(() => {
  const seen = new Set<InventoryFlagType>()
  for (const container of props.containers) {
    for (const flag of container.activeFlags ?? []) seen.add(flag.kind)
  }
  return (Object.keys(FLAG_META) as InventoryFlagType[]).filter(flag => seen.has(flag))
})

// Show only actions allowed for every selected container; hide "unflag" when none carry a flag.
const actionOptions = computed(() =>
  ACTION_ORDER
    .filter(action => commonAllowedActions.value.has(action))
    .filter(action => action !== 'unflag' || availableFlags.value.length > 0)
    .map(action => ({ value: action, label: actionLabel(action) }))
)

// Flagging offers every category; unflagging is restricted to flags that actually exist.
const flagOptions = computed(() => {
  const flags = selectedAction.value === 'unflag'
    ? availableFlags.value
    : (Object.keys(FLAG_META) as InventoryFlagType[])
  return flags.map(flag => ({ value: flag, label: FLAG_META[flag].label }))
})

// Keep the selected action valid whenever the available options change (selection/status shifts).
watch(actionOptions, (options) => {
  if (!options.some(option => option.value === selectedAction.value)) {
    selectedAction.value = options[0]?.value ?? 'note'
  }
}, { immediate: true })

// Keep the selected flag valid whenever the action or the available options change.
watch([selectedAction, flagOptions], () => {
  const valid = flagOptions.value.some(option => option.value === selectedFlag.value)
  if (!valid && flagOptions.value.length > 0) {
    selectedFlag.value = flagOptions.value[0]!.value
  }
})

function onActionUpdate(value: unknown) {
  const resolved = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : undefined
  if (typeof resolved === 'string' && commonAllowedActions.value.has(resolved as InventoryActionType)) {
    selectedAction.value = resolved as InventoryActionType
  }
}

function onFlagUpdate(value: unknown) {
  const resolved = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : undefined
  if (typeof resolved === 'string' && resolved in FLAG_META) {
    selectedFlag.value = resolved as InventoryFlagType
  }
}

const { mutateAsync: alterContainersAsync, isLoading } = useAlterContainersMutation()

async function handleAlter() {
  if (count.value === 0) return

  try {
    await alterContainersAsync({
      containerSlug: props.containers.map(c => c.slug),
      performedAction: selectedAction.value,
      flagKind: requiresFlag.value ? selectedFlag.value : null,
      logComment: logComment.value.trim() || null,
      containers: props.containers
    })
    isOpen.value = false
    logComment.value = ''
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
    title="Apply action to containers"
    description="Perform a lifecycle action on every selected container at once."
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Act' : `Act (${count})`"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-activity"
      />
    </template>

    <div class="p-4 space-y-4">
      <p class="text-muted text-sm">
        Applying to <span class="font-semibold">{{ count }}</span> container{{ count === 1 ? '' : 's' }}.
      </p>

      <NAlert
        v-if="actionOptions.length === 0"
        alert="soft-warning"
        title="No shared action"
        description="The selected containers have no lifecycle action in common for their current statuses."
        icon
      />

      <NFormField
        v-else
        name="action"
        label="Action"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="selectedAction"
          :items="actionOptions"
          by="value"
          @update:model-value="onActionUpdate"
        />
      </NFormField>

      <NAlert
        v-if="isDispose"
        alert="soft-error"
        title="Disposal is permanent"
        icon="i-lucide-trash-2"
      >
        <p class="text-sm">
          Disposing frees each container's slot in its parent and marks it
          <span class="font-semibold">disposed</span> — a terminal state that cannot be undone or
          reactivated. Only notes can be added afterwards.
        </p>
      </NAlert>

      <NFormField
        v-if="requiresFlag"
        name="flagKind"
        label="Flag category"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="selectedFlag"
          :items="flagOptions"
          by="value"
          @update:model-value="onFlagUpdate"
        />
      </NFormField>

      <NFormField
        name="logComment"
        label="Reason / note"
        :una="{ formLabel: FORM_LABEL_STYLE, formDescription: 'text-muted' }"
      >
        <NInput
          v-model="logComment"
          type="textarea"
          :rows="2"
          placeholder="Optional — appended to each container's action log"
        />
      </NFormField>
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
          :label="isDispose
            ? `Dispose ${count} container${count === 1 ? '' : 's'}`
            : `Apply to ${count} container${count === 1 ? '' : 's'}`"
          :btn="isDispose ? 'soft-error hover:outline-error' : 'soft-success hover:outline-success'"
          :leading="isDispose ? 'i-lucide-trash-2' : undefined"
          :trailing="isDispose ? undefined : 'i-lucide-check'"
          :disabled="count === 0 || actionOptions.length === 0"
          :loading="isLoading"
          @click="handleAlter"
        />
      </div>
    </template>
  </NDialog>
</template>
