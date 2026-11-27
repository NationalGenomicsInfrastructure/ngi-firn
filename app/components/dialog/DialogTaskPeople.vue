<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { DisplayUserToUsers, SerializedUserRef } from '~~/types/auth'
import type { DisplayTask } from '~~/types/productivity'
import type { SetSharingSchemaInput } from '~~/schemas/tasks/tasks'
import { setTaskSharing } from '~/utils/mutations/tasks/tasks'
import { allUsersQuery } from '~/utils/queries/users'

/*
 * Edit who is responsible for a task and who may view it. Render it only when the server offers the
 * user that (task.actions.setSharing).
 *
 * Only a list that was actually changed is sent. That keeps e.g. a colleague's claim made while the
 * dialog was open, as long as the responsible users were not edited here.
 */
const props = defineProps<{
  task: DisplayTask
}>()

interface People {
  responsible: DisplayUserToUsers[]
  viewers: DisplayUserToUsers[]
}

const isOpen = ref(false)

const { state: usersState } = useQuery(() => ({ ...allUsersQuery, enabled: isOpen.value }))

/* The task's members at the moment the dialog was opened. */
const snapshot = ref<{ responsible: SerializedUserRef[], viewers: SerializedUserRef[] }>()
/* The selectable members of the snapshot, and the edited copy of them. */
const original = ref<People>()
const draft = ref<People>()
/* Members who are no longer active users: the server refuses them, so they cannot be sent back. */
const inactiveNames = ref<string[]>([])

function onOpenChange(open: boolean) {
  isOpen.value = open
  snapshot.value = open ? { responsible: props.task.responsibleUsers, viewers: props.task.viewers } : undefined
  original.value = undefined
  draft.value = undefined
  inactiveNames.value = []
}

// The task only carries user stubs; the lists need the full entries, which may still be loading.
watch([snapshot, () => usersState.value.data], ([members, users]) => {
  if (!members || !users || draft.value) return
  const byId = new Map(users.map(user => [user.firnId, user]))
  const known = (refs: SerializedUserRef[]) => refs.flatMap(ref => byId.get(ref.firnId) ?? [])
  original.value = { responsible: known(members.responsible), viewers: known(members.viewers) }
  draft.value = { ...original.value }
  inactiveNames.value = [...members.responsible, ...members.viewers]
    .filter(ref => !byId.has(ref.firnId))
    .map(ref => ref.name)
}, { immediate: true })

const ownerFirnIds = computed(() =>
  props.task.managingOwner.kind === 'user' ? [props.task.managingOwner.user.firnId] : []
)

function firnIds(users: DisplayUserToUsers[]) {
  return users.map(user => user.firnId)
}

function sameMembers(a: DisplayUserToUsers[], b: DisplayUserToUsers[]) {
  const ids = new Set(firnIds(a))
  return a.length === b.length && b.every(user => ids.has(user.firnId))
}

const changes = computed((): SetSharingSchemaInput => {
  if (!draft.value || !original.value) return {}
  const result: SetSharingSchemaInput = {}
  if (!sameMembers(draft.value.responsible, original.value.responsible)) {
    result.responsibleFirnIds = firnIds(draft.value.responsible)
  }
  if (!sameMembers(draft.value.viewers, original.value.viewers)) {
    result.viewerFirnIds = firnIds(draft.value.viewers)
  }
  return result
})
const hasChanges = computed(() => Object.keys(changes.value).length > 0)

const { mutateAsync: setSharingAsync, isLoading: isSaving } = setTaskSharing()

async function save() {
  try {
    await setSharingAsync({ taskSlug: props.task.slug, ...changes.value })
    onOpenChange(false)
  }
  catch {
    // The mutation has already shown the reason. Keep the dialog and the edits for another try.
  }
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Edit people"
    description="Choose who works on this task and who may follow it."
    @update:open="onOpenChange"
  >
    <template #trigger>
      <NButton
        label="Edit people"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-users"
      />
    </template>

    <div class="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
      <template v-if="draft">
        <NAlert
          v-if="inactiveNames.length"
          alert="border-warning"
          title="Inactive members"
          :description="`No longer active: ${inactiveNames.join(', ')}. They are removed from any list you change.`"
          icon="i-lucide-user-round-x"
        />
        <FormFieldTaskPeople
          v-model:responsible="draft.responsible"
          v-model:viewers="draft.viewers"
          :exclude-firn-ids="ownerFirnIds"
        />
      </template>
      <NAlert
        v-else-if="usersState.status === 'error'"
        alert="border-error"
        title="Could not load the users"
        :description="usersState.error.message || 'Something went wrong. Please try again.'"
        icon="i-lucide-alert-circle"
      />
      <NAlert
        v-else
        alert="border-gray"
        title="Loading users..."
        description="Fetching the list of colleagues."
        icon="i-lucide-loader-2"
      />
    </div>

    <template #footer>
      <div class="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NButton
          label="Save"
          btn="solid-primary"
          leading="i-lucide-save"
          :disabled="!hasChanges"
          :loading="isSaving"
          @click="save"
        />
      </div>
    </template>
  </NDialog>
</template>
