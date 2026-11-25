<script setup lang="ts">
import type { DisplayTask } from '~~/types/productivity'
import { groupTasksByPanel, TASK_PANELS } from '~/utils/tasks/panels'

const props = defineProps<{
  tasks: DisplayTask[]
  loading?: boolean
}>()

const groups = computed(() => groupTasksByPanel(props.tasks))
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
    <TableTasks
      v-for="panel in TASK_PANELS"
      :key="panel.id"
      :title="panel.title"
      :description="panel.description"
      :icon="panel.icon"
      :empty-text="panel.emptyText"
      :tasks="groups[panel.id]"
      :loading="loading"
    />
  </div>
</template>
