<script setup lang="ts">
import type { DisplayTask } from '~~/types/productivity'
import {
  archiveTask,
  cancelTask,
  claimTask,
  publishTask,
  releaseTaskResponsibility
} from '~/utils/mutations/tasks/tasks'

/*
 * The toolbar of a task's page. It shows what the server offers the current user (task.actions) and
 * holds no rules of its own: new restrictions belong in server/auth/taskPolicy.ts.
 */

const props = defineProps<{
  task: DisplayTask
}>()

const actions = computed(() => props.task.actions)
const hasActions = computed(() => Object.keys(actions.value).length > 0)
/* Why offered actions are refused for now; several may share a reason. */
const blockedReasons = computed(() =>
  [...new Set(Object.values(actions.value).flatMap(action => action.blockedReason ?? []))]
)

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
    v-if="hasActions"
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
      v-if="actions.setSharing"
      :task="task"
    />
    <template v-if="actions.releaseResponsibility">
      <DialogConfirmAction
        v-if="task.visibility === 'private'"
        title="Release responsibility"
        description="This task is private: giving up responsibility also gives up your access to it."
        trigger-label="Release responsibility"
        confirm-label="Release"
        icon="i-lucide-user-round-minus"
        :loading="isReleasing"
        :disabled="!!actions.releaseResponsibility.blockedReason"
        :action="release"
      />
      <NButton
        v-else
        size="sm"
        btn="soft-gray hover:outline-gray"
        leading="i-lucide-user-round-minus"
        label="Release responsibility"
        :loading="isReleasing"
        :disabled="isReleasing || !!actions.releaseResponsibility.blockedReason"
        @click="run(release)"
      />
    </template>

    <template
      v-if="actions.cancel || actions.archive"
      #end
    >
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
        :disabled="!!actions.cancel.blockedReason"
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
        :disabled="!!actions.archive.blockedReason"
        :action="() => archiveAsync(input)"
      />
    </template>
    <p
      v-for="reason in blockedReasons"
      :key="reason"
      class="order-last basis-full text-xs text-muted"
    >
      {{ reason }}
    </p>
  </PageToolbar>
</template>
