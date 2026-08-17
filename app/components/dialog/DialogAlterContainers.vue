<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType } from '~~/schemas/inventory/metadata'
import { ACTION_TYPE_META, FLAG_META } from '~/utils/inventory/actionLog'
import { alterContainer as useAlterContainersMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  containers: DisplayContainer[]
}>()

const emit = defineEmits<{ done: [] }>()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

// Actions the batch alter endpoint accepts — register/move/modify are rejected server-side
// because they have dedicated workflows.
const SUPPORTED_ACTIONS: InventoryActionType[] = [
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

const actionOptions = SUPPORTED_ACTIONS.map(action => ({
  value: action,
  label: ACTION_TYPE_META[action].label
}))

const flagOptions = (Object.keys(FLAG_META) as InventoryFlagType[]).map(flag => ({
  value: flag,
  label: FLAG_META[flag].label
}))

const isOpen = ref(false)
const selectedAction = ref<InventoryActionType>('checkout')
const selectedFlag = ref<InventoryFlagType>('info')
const logComment = ref('')

const count = computed(() => props.containers.length)
const requiresFlag = computed(() => selectedAction.value === 'flag' || selectedAction.value === 'unflag')

function onActionUpdate(value: unknown) {
  const resolved = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : undefined
  if (typeof resolved === 'string' && (SUPPORTED_ACTIONS as string[]).includes(resolved)) {
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
      logComment: logComment.value.trim() || null
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
    :model-value="isOpen"
    title="Apply action to containers"
    description="Perform a lifecycle action on every selected container at once."
    @update:model-value="onDialogOpenChange"
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

      <NFormField
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
          :label="`Apply to ${count} container${count === 1 ? '' : 's'}`"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-check"
          :disabled="count === 0"
          :loading="isLoading"
          @click="handleAlter"
        />
      </div>
    </template>
  </NDialog>
</template>
