<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'
import { displayUserName } from '~/utils/users/display'

/*
 * Editable list of users with avatars. Rows can be ticked for bulk removal; every removal,
 * single or bulk, is confirmed in a dialog before the updated list is emitted.
 */
const props = withDefaults(defineProps<{
  modelValue: DisplayUserToUsers[]
  emptyText?: string
  /* Plural noun used in the confirmation dialog, e.g. "responsible users". */
  noun?: string
}>(), {
  emptyText: 'No users selected.',
  noun: 'users'
})

const emit = defineEmits<{
  'update:modelValue': [value: DisplayUserToUsers[]]
}>()

const selectedIds = ref<string[]>([])
const pendingRemoval = ref<DisplayUserToUsers[]>([])

// Drop ticks of users that left the list (e.g. removed or reset from outside).
watch(() => props.modelValue, (users) => {
  const present = new Set(users.map(user => user.firnId))
  selectedIds.value = selectedIds.value.filter(id => present.has(id))
})

const allSelected = computed(() =>
  props.modelValue.length > 0 && selectedIds.value.length === props.modelValue.length
)
const someSelected = computed(() => selectedIds.value.length > 0 && !allSelected.value)

function isSelected(user: DisplayUserToUsers) {
  return selectedIds.value.includes(user.firnId)
}

function toggle(user: DisplayUserToUsers, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value.filter(id => id !== user.firnId), user.firnId]
    : selectedIds.value.filter(id => id !== user.firnId)
}

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? props.modelValue.map(user => user.firnId) : []
}

function requestRemoval(users: DisplayUserToUsers[]) {
  if (users.length) pendingRemoval.value = users
}

function confirmRemoval() {
  const removed = new Set(pendingRemoval.value.map(user => user.firnId))
  emit('update:modelValue', props.modelValue.filter(user => !removed.has(user.firnId)))
  pendingRemoval.value = []
}

function onDialogOpenChange(open: boolean) {
  if (!open) pendingRemoval.value = []
}

const dialogDescription = computed(() => {
  const users = pendingRemoval.value
  if (users.length === 1 && users[0]) return `Remove ${displayUserName(users[0])} from the ${props.noun}?`
  return `Remove ${users.length} ${props.noun} from the list?`
})
</script>

<template>
  <div class="space-y-2">
    <template v-if="modelValue.length">
      <div class="flex items-center justify-between gap-2 min-h-8">
        <NCheckbox
          :model-value="allSelected ? true : someSelected ? 'indeterminate' : false"
          label="Select all"
          @update:model-value="value => toggleAll(value === true)"
        />
        <NButton
          v-if="selectedIds.length"
          type="button"
          size="xs"
          :label="`Remove selected (${selectedIds.length})`"
          btn="soft-error hover:outline-error"
          leading="i-lucide-users-collaboration"
          @click="requestRemoval(modelValue.filter(isSelected))"
        />
      </div>

      <ul class="divide-y divide-muted rounded-md">
        <li
          v-for="user in modelValue"
          :key="user.firnId"
          class="flex items-center gap-3 px-3 py-2"
        >
          <NCheckbox
            :model-value="isSelected(user)"
            :aria-label="`Select ${displayUserName(user)}`"
            @update:model-value="value => toggle(user, value === true)"
          />
          <AvatarFirn :user="user" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ displayUserName(user) }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ user.googleEmail }}
            </p>
          </div>
          <NButton
            v-if="!selectedIds.length"
            type="button"
            btn="soft-error hover:outline-error"
            icon
            label="i-lucide-user-round-x"
            :aria-label="`Remove ${displayUserName(user)}`"
            @click="requestRemoval([user])"
          />
        </li>
      </ul>
    </template>
    <p
      v-else
      class="text-sm text-muted"
    >
      {{ emptyText }}
    </p>

    <NDialog
      :open="pendingRemoval.length > 0"
      title="Remove users"
      :description="dialogDescription"
      @update:open="onDialogOpenChange"
    >
      <template #footer>
        <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
          <NButton
            type="button"
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
            @click="pendingRemoval = []"
          />
          <NButton
            type="button"
            label="Remove"
            btn="soft-error hover:outline-error"
            leading="i-lucide-user-round-x"
            @click="confirmRemoval"
          />
        </div>
      </template>
    </NDialog>
  </div>
</template>
