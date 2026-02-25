<script setup lang="ts">
import type { ProjectSummary } from '~~/types/projects'

const props = defineProps<{
  projectSummary?: ProjectSummary
  projectSummaryLinks?: [string, string][]
}>()

const summaryFields = computed(() => {
  if (!props.projectSummary) return []

  const fieldDefs: Array<{ label: string, key: keyof ProjectSummary }> = [
    { label: 'Bioinfo responsible', key: 'bioinfo_responsible' },
    { label: 'Lab responsible', key: 'lab_responsible' },
    { label: 'Queued', key: 'queued' },
    { label: 'All samples sequenced', key: 'all_samples_sequenced' },
    { label: 'All raw data delivered', key: 'all_raw_data_delivered' },
    { label: 'Signature (queued)', key: 'signature_queued' },
    { label: 'Signature (all sequenced)', key: 'signature_all_samples_sequenced' },
    { label: 'Signature (all delivered)', key: 'signature_all_raw_data_delivered' },
    { label: 'Method document', key: 'method_document' },
    { label: 'Document version', key: 'document_version' },
    { label: 'Instructions', key: 'instructions' },
    { label: 'Comments', key: 'comments' }
  ]

  return fieldDefs
    .filter(f => props.projectSummary?.[f.key] != null && String(props.projectSummary[f.key]).trim() !== '')
    .map(f => ({ label: f.label, value: String(props.projectSummary![f.key]) }))
})
</script>

<template>
  <NCard
    title="Project summary"
    card="soft-gray"
    class="w-full"
  >
    <template v-if="!projectSummary">
      <p class="text-sm text-muted">
        No summary available.
      </p>
    </template>
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm">
        <div
          v-for="field in summaryFields"
          :key="field.label"
        >
          <span class="font-semibold text-muted">{{ field.label }}</span>
          <p>{{ field.value }}</p>
        </div>
      </div>

      <div
        v-if="projectSummaryLinks?.length"
        class="mt-6"
      >
        <h4 class="text-sm font-semibold text-muted mb-2">
          Summary links
        </h4>
        <ul class="space-y-1">
          <li
            v-for="([url, label], index) in projectSummaryLinks"
            :key="index"
            class="text-sm"
          >
            <a
              :href="url"
              target="_blank"
              rel="noopener"
              class="text-primary hover:underline"
            >
              {{ label }}
            </a>
          </li>
        </ul>
      </div>
    </template>
  </NCard>
</template>
