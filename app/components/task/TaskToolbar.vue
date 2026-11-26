<script setup lang="ts">
import type { DisplayTask } from '~~/types/productivity'
import {
  archiveTask,
  cancelTask,
  claimTask,
  publishTask,
  releaseTaskResponsibility
} from '~/utils/mutations/tasks/tasks'
import { hasTaskActions, taskActions } from '~/utils/tasks/actions'

/* The actions the current user may take on a task, as the toolbar of its page. */

const props = defineProps<{
  task: DisplayTask
}>()

const actions = computed(() => taskActions(props.task))

const { mutateAsync: publishAsync, isLoading: isPublishing } = publishTask()
const { mutateAsync: claimAsync, isLoading: isClaiming } = claimTask()
const { mutateAsync: releaseAsync, isLoading: isReleasing } = releaseTaskResponsibility()
const { mutateAsync: cancelAsync, isLoading: isCancelling } = cancelTask()
const { mutateAsync: archiveAsync, isLoading: isArchiving } = archiveTask()

const input = computed(() => ({ taskSlug: props.task.slug }))

/* For buttons without a dialog: the mutation reports failures itself. */
function run(action: () => Promise<unknown>) {
  action().catch(() => {})
}

async function release() {
  const updated = await releaseAsync(input.value)
  // Giving up a private task can take away the right to see it; do not stay on a dead page.
  if (updated.visibility === 'private' && updated.viewerRole === 'public') {
    await navigateTo('/tasks/own')
  }
}
</script>

<template>
  <PageToolbar
    v-if="hasTaskActions(actions)"
    label="Task actions"
  >
    <NButton
      v-if="actions.publish"
      size="sm"
      btn="solid-primary"
      leading="i-lucide-send"
      label="Publish"
      :loading="isPublishing"
      :disabled="isPublishing"
      @click="run(() => publishAsync(input))"
    />
    <NButton
      v-if="actions.claim"
      size="sm"
      btn="solid-primary"
      leading="i-lucide-hand"
      label="Claim task"
      :loading="isClaiming"
      :disabled="isClaiming"
      @click="run(() => claimAsync(input))"
    />
    <DialogTaskPeople
      v-if="actions.editPeople"
      :task="task"
    />
    <template v-if="actions.release">
      <DialogConfirmAction
        v-if="task.visibility === 'private'"
        title="Release responsibility"
        description="This task is private. Unless you are also one of its viewers, you will not be able to open it afterwards."
        trigger-label="Release responsibility"
        confirm-label="Release"
        icon="i-lucide-user-round-minus"
        :loading="isReleasing"
        :action="release"
      />
      <NButton
        v-else
        size="sm"
        btn="soft-gray hover:outline-gray"
        leading="i-lucide-user-round-minus"
        label="Release responsibility"
        :loading="isReleasing"
        :disabled="isReleasing"
        @click="run(release)"
      />
    </template>

    <template
      v-if="actions.cancel || actions.archive"
      #end
    >
      <p
        v-if="actions.closingBlocked"
        class="text-xs text-muted"
      >
        Work is activated: finish or cancel it before closing the task.
      </p>
      <DialogConfirmAction
        v-if="actions.cancel"
        title="Cancel task"
        :description="`Cancel “${task.title}”? Its steps can then no longer be changed or carried out. This cannot be undone.`"
        trigger-label="Cancel task"
        confirm-label="Cancel task"
        icon="i-lucide-ban"
        trigger-btn="soft-error hover:outline-error"
        confirm-btn="soft-error hover:outline-error"
        :loading="isCancelling"
        :disabled="actions.closingBlocked"
        :action="() => cancelAsync(input)"
      />
      <DialogConfirmAction
        v-if="actions.archive"
        title="Archive task"
        :description="`Archive “${task.title}”? It disappears from the task lists. This cannot be undone.`"
        trigger-label="Archive"
        confirm-label="Archive task"
        icon="i-lucide-archive"
        :loading="isArchiving"
        :disabled="actions.closingBlocked"
        :action="() => archiveAsync(input)"
      />
    </template>
  </PageToolbar>
</template>
