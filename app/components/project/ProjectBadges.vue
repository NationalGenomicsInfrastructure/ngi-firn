<script setup lang="ts">
import type { ProjectStatusFields, ProjectPriority } from '~~/types/projects'

const props = defineProps<{
  projectId: string
  statusFields?: ProjectStatusFields
  priority?: ProjectPriority
}>()

const hasAnyBadge = computed(() =>
  !!(
    props.projectId
    || props.statusFields?.status
    || props.priority
    || (props.statusFields && (
      props.statusFields.open
      || props.statusFields.ongoing
      || props.statusFields.closed
      || props.statusFields.pending
      || props.statusFields.reception_control
      || props.statusFields.aborted
      || props.statusFields.need_review
    ))
  )
)
</script>

<template>
  <div
    v-if="hasAnyBadge"
    class="flex flex-wrap items-center gap-2"
  >
    <NBadge
      v-if="projectId"
      badge="outline"
      :label="projectId"
    />
    <NBadge
      v-if="statusFields?.status"
      :badge="statusFields.status === 'Ongoing'
        ? 'solid-primary'
        : statusFields.status === 'Closed'
          ? 'solid-gray'
          : statusFields.status === 'Aborted'
            ? 'solid-error'
            : statusFields.status === 'Reception Control'
              ? 'solid-yellow'
              : statusFields.status === 'Pending'
                ? 'solid-gray'
                : 'solid-gray'"
      :icon="statusFields.status === 'Ongoing'
        ? 'i-lucide-play'
        : statusFields.status === 'Closed'
          ? 'i-lucide-lock'
          : statusFields.status === 'Aborted'
            ? 'i-lucide-ban'
            : statusFields.status === 'Reception Control'
              ? 'i-lucide-package-check'
              : statusFields.status === 'Pending'
                ? 'i-lucide-clock'
                : 'i-lucide-notebook-pen'"
      :label="statusFields.status"
    />
    <NBadge
      v-if="priority"
      :badge="priority === 'High'
        ? 'solid-error'
        : priority === 'Standard'
          ? 'solid-success'
          : priority === 'Low'
            ? 'solid-gray'
            : 'solid-gray'"
      :icon="priority === 'High'
        ? 'i-lucide-arrow-up-circle'
        : priority === 'Standard'
          ? 'i-lucide-minus-circle'
          : priority === 'Low'
            ? 'i-lucide-arrow-down-circle'
            : 'i-lucide-circle'"
      :label="`Priority: ${priority}`"
    />
    <NBadge
      v-if="statusFields?.open"
      badge="solid-success"
      icon="i-lucide-lock-open"
      label="Open"
    />
    <NBadge
      v-if="statusFields?.ongoing"
      badge="solid-info"
      icon="i-lucide-play"
      label="Ongoing"
    />
    <NBadge
      v-if="statusFields?.closed"
      badge="solid-gray"
      icon="i-lucide-lock"
      label="Closed"
    />
    <NBadge
      v-if="statusFields?.pending"
      badge="solid-yellow"
      icon="i-lucide-clock"
      label="Pending"
    />
    <NBadge
      v-if="statusFields?.reception_control"
      badge="solid-indigo"
      icon="i-lucide-package-check"
      label="Reception control"
    />
    <NBadge
      v-if="statusFields?.aborted"
      badge="solid-error"
      icon="i-lucide-ban"
      label="Aborted"
    />
    <NBadge
      v-if="statusFields?.need_review"
      badge="solid-yellow"
      icon="i-lucide-alert-triangle"
      label="Needs review"
    />
  </div>
</template>
