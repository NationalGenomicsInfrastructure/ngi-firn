<script setup lang="ts">
import type { DisplayTask } from '~~/types/productivity'
import { formatDate } from '~/utils/dates/formatting'
import { entityKindIcon, entityRoute } from '~/utils/inventory/entity'
import { TASK_IMPORTANCE_OPTIONS, TASK_VISIBILITY_OPTIONS, taskOptionLabel } from '~/utils/tasks/options'
import { TASK_PANELS } from '~/utils/tasks/panels'
import { TASK_STATUS_META, TASK_VIEWER_ROLE_LABELS } from '~/utils/tasks/meta'

/* Everything recorded about a task apart from its steps. Styled after docs/ui-style.md. */

const props = defineProps<{
  task: DisplayTask
}>()

const statusMeta = computed(() => TASK_STATUS_META[props.task.status])
const panel = computed(() => TASK_PANELS.find(entry => entry.id === props.task.quadrant))

const infoFields = computed(() => [
  { icon: 'i-lucide-key-round', label: 'Identifier', value: props.task.slug },
  { icon: panel.value?.icon, label: 'Priority', value: panel.value?.title ?? '—' },
  {
    icon: 'i-lucide-eye',
    label: 'Visibility',
    value: taskOptionLabel(TASK_VISIBILITY_OPTIONS, props.task.visibility)
  },
  { icon: 'i-lucide-user-check', label: 'Your role', value: TASK_VIEWER_ROLE_LABELS[props.task.viewerRole] }
])

const people = computed(() => [
  { label: 'Responsible', users: props.task.responsibleUsers, emptyText: 'Nobody assigned yet' },
  { label: 'Viewers', users: props.task.viewers, emptyText: 'No additional viewers' }
])

// Creator and owner are usually the same person; naming them twice adds nothing.
const actors = computed(() => {
  const { creator, managingOwner } = props.task
  const same = creator.kind === 'user'
    ? managingOwner.kind === 'user' && managingOwner.user.firnId === creator.user.firnId
    : managingOwner.kind === 'system' && managingOwner.source === creator.source
  return same
    ? [{ label: 'Created and managed by', actor: managingOwner }]
    : [
        { label: 'Managed by', actor: managingOwner },
        { label: 'Created by', actor: creator }
      ]
})

const links = computed(() => [
  ...(props.task.projectRefs ?? []),
  ...(props.task.inventoryRefs ?? [])
])

const timestamps = computed(() => [
  { label: 'Created', value: props.task.createdAt },
  { label: 'Last updated', value: props.task.updatedAt },
  { label: 'Completed', value: props.task.completedAt },
  { label: 'Cancelled', value: props.task.cancelledAt },
  { label: 'Archived', value: props.task.archivedAt }
].flatMap(({ label, value }) => value ? [{ label, value }] : []))
</script>

<template>
  <CardAccent :_card-content="{ class: 'p-5 pt-5 space-y-4' }">
    <header class="space-y-2">
      <p :class="UI_LABEL_STYLE">
        Lab task
      </p>
      <h2 class="text-lg font-semibold break-words text-primary-700 dark:text-primary-400">
        {{ task.title }}
      </h2>
      <div class="flex flex-wrap items-center gap-1.5">
        <NBadge
          :label="statusMeta.label"
          :icon="statusMeta.icon"
          :badge="statusMeta.badge"
        />
        <NBadge
          v-if="task.importance === 'important'"
          :label="taskOptionLabel(TASK_IMPORTANCE_OPTIONS, task.importance)"
          icon="i-lucide-flag"
          badge="solid-primary"
        />
        <NBadge
          v-if="task.archivedAt"
          label="Archived"
          icon="i-lucide-archive"
          badge="solid-gray"
        />
      </div>
      <div
        v-if="task.dueDate || task.urgencyReason"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted"
      >
        <TaskDueIndicators :task="task" />
      </div>
      <p
        v-if="task.description"
        class="text-sm whitespace-pre-line break-words"
      >
        {{ task.description }}
      </p>
      <p
        v-else
        class="text-sm text-muted"
      >
        No description.
      </p>
    </header>

    <NSeparator />

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
      <div
        v-for="field in infoFields"
        :key="field.label"
        class="min-w-0 space-y-1"
      >
        <dt :class="UI_LABEL_STYLE">
          {{ field.label }}
        </dt>
        <dd class="flex items-start gap-1.5 font-medium">
          <NIcon
            v-if="field.icon"
            :name="field.icon"
            class="mt-0.5 shrink-0 text-muted"
          />
          <span class="min-w-0 break-words">{{ field.value }}</span>
        </dd>
      </div>
    </dl>

    <NSeparator />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
      <div
        v-for="entry in actors"
        :key="entry.label"
        class="min-w-0 space-y-1.5"
      >
        <p :class="UI_LABEL_STYLE">
          {{ entry.label }}
        </p>
        <IndicatorUserAvatar
          v-if="entry.actor.kind === 'user'"
          :user="entry.actor.user"
        />
        <p
          v-else
          class="flex items-center gap-2 text-sm font-medium"
        >
          <NIcon name="i-lucide-bot" />
          {{ entry.actor.source }}
        </p>
      </div>
      <div
        v-for="group in people"
        :key="group.label"
        class="min-w-0 space-y-1.5"
      >
        <p :class="UI_LABEL_STYLE">
          {{ group.label }}
        </p>
        <IndicatorUserAvatar
          v-for="user in group.users"
          :key="user.firnId"
          :user="user"
        />
        <p
          v-if="!group.users.length"
          class="text-sm text-muted"
        >
          {{ group.emptyText }}
        </p>
      </div>
    </div>

    <!-- Next to what it edits; only the managing owner may change who is involved. -->
    <div
      v-if="task.viewerRole === 'owner'"
      class="flex justify-end"
    >
      <DialogTaskPeople :task="task" />
    </div>

    <NSeparator />

    <div class="space-y-1.5">
      <p :class="UI_LABEL_STYLE">
        Linked projects and inventory
      </p>
      <ul
        v-if="links.length"
        class="flex flex-wrap gap-2"
      >
        <li
          v-for="link in links"
          :key="`${link.kind}:${link.slug}`"
          class="max-w-full"
        >
          <NButton
            btn="soft-primary hover:outline-primary"
            size="sm"
            :leading="entityKindIcon(link.kind)"
            :label="link.name"
            :to="entityRoute(link) ?? undefined"
          />
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-muted"
      >
        Nothing linked.
      </p>
    </div>

    <NSeparator />

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted">
      <template
        v-for="stamp in timestamps"
        :key="stamp.label"
      >
        <dt>{{ stamp.label }}</dt>
        <dd>{{ formatDate(stamp.value, { time: true }) }}</dd>
      </template>
    </dl>
  </CardAccent>
</template>
