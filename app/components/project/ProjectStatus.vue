<script setup lang="ts">
import type { ProjectStatusFields } from '~~/types/projects'

const props = defineProps<{
  statusFields: ProjectStatusFields
}>()

const statusVariant = computed(() => {
  switch (props.statusFields.status) {
    case 'Ongoing': return 'soft-primary'
    case 'Closed': return 'soft-gray'
    case 'Aborted': return 'solid-error'
    case 'Reception Control': return 'outline-primary'
    case 'Pending': return 'outline-gray'
    default: return 'soft-gray'
  }
})

const activeFlags = computed(() => {
  const flagDefs: Array<{ key: keyof Omit<ProjectStatusFields, 'status'>, label: string, variant: string }> = [
    { key: 'open', label: 'Open', variant: 'soft-primary' },
    { key: 'ongoing', label: 'Ongoing', variant: 'soft-primary' },
    { key: 'closed', label: 'Closed', variant: 'soft-gray' },
    { key: 'pending', label: 'Pending', variant: 'outline-gray' },
    { key: 'reception_control', label: 'Reception control', variant: 'outline-primary' },
    { key: 'aborted', label: 'Aborted', variant: 'solid-error' },
    { key: 'need_review', label: 'Needs review', variant: 'outline-yellow' }
  ]
  return flagDefs.filter(f => props.statusFields[f.key])
})
</script>

<template>
  <NCard
    title="Status flags"
    card="soft-gray"
    class="w-full"
  >
    <div class="flex flex-wrap gap-2">
      <NBadge
        v-if="statusFields.status"
        :badge="statusVariant"
        :label="statusFields.status"
        leading="i-lucide-notebook-pen"
      />
      <NBadge
        v-for="flag in activeFlags"
        :key="flag.key"
        :badge="flag.variant"
        :label="flag.label"
        leading="i-lucide-flag"
      />
      <span
        v-if="!statusFields.status && activeFlags.length === 0"
        class="text-sm text-muted"
      >
        No status information available.
      </span>
    </div>
  </NCard>
</template>
