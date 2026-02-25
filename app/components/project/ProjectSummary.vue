<script setup lang="ts">
import type { ProjectSummary } from '~~/types/projects'

const props = defineProps<{
  projectSummary?: ProjectSummary
  projectSummaryLinks?: [string, string][]
}>()

const summaryFields = computed(() => {
  if (!props.projectSummary) return []

  const fieldDefs: Array<{ label: string, key: keyof ProjectSummary, icon: string }> = [
    { label: 'Bioinfo responsible', key: 'bioinfo_responsible', icon: 'i-lucide-cpu' },
    { label: 'Lab responsible', key: 'lab_responsible', icon: 'i-lucide-flask-conical' },
    { label: 'Queued', key: 'queued', icon: 'i-lucide-list-ordered' },
    { label: 'All samples sequenced', key: 'all_samples_sequenced', icon: 'i-lucide-check-circle' },
    { label: 'All raw data delivered', key: 'all_raw_data_delivered', icon: 'i-lucide-package-check' },
    { label: 'Signature (queued)', key: 'signature_queued', icon: 'i-lucide-pen-tool' },
    { label: 'Signature (all sequenced)', key: 'signature_all_samples_sequenced', icon: 'i-lucide-pen-tool' },
    { label: 'Signature (all delivered)', key: 'signature_all_raw_data_delivered', icon: 'i-lucide-pen-tool' },
    { label: 'Method document', key: 'method_document', icon: 'i-lucide-file-text' },
    { label: 'Document version', key: 'document_version', icon: 'i-lucide-file-badge' },
    { label: 'Instructions', key: 'instructions', icon: 'i-lucide-book-open' },
    { label: 'Comments', key: 'comments', icon: 'i-lucide-message-square' }
  ]

  return fieldDefs
    .filter(f => props.projectSummary?.[f.key] != null && String(props.projectSummary[f.key]).trim() !== '')
    .map(f => ({ label: f.label, value: String(props.projectSummary![f.key]), icon: f.icon }))
})
</script>

<template>
  <NCard
    title="Project summary"
    card="outline-gray"
    class="w-full"
  >
    <template v-if="!projectSummary">
      <p class="text-sm text-muted">
        No summary available.
      </p>
    </template>
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
        <div
          v-for="field in summaryFields"
          :key="field.label"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              :name="field.icon"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">{{ field.label }}</span>
          </div>
          <p class="font-medium pl-5">
            {{ field.value }}
          </p>
        </div>
      </div>

      <template v-if="projectSummaryLinks?.length">
        <NSeparator class="my-5" />

        <div class="flex items-center gap-2 mb-3">
          <NIcon
            name="i-lucide-link"
            class="text-muted"
          />
          <h4 class="text-sm font-semibold">
            Summary links
          </h4>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="([url, label], index) in projectSummaryLinks"
            :key="index"
            class="flex items-center gap-2 text-sm"
          >
            <NIcon
              name="i-lucide-external-link"
              class="text-muted text-xs shrink-0"
            />
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
      </template>
    </template>
  </NCard>
</template>
