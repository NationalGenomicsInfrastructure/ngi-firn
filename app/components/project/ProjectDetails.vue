<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import type { ProjectDetails } from '~~/types/projects'
import { parseDetailsLinks } from '~~/schemas/projects'

const props = defineProps<{
  details?: ProjectDetails
}>()

// Store the open groups in local storage to persist between page loads
const ACCORDION_STORAGE_KEY = 'ngi-firn-project-details-accordion-open'
const storedOpenGroups = useStorage<string[]>(ACCORDION_STORAGE_KEY, [])

interface DetailGroup {
  label: string
  icon: string
  keys: string[]
}

const DETAIL_GROUPS: Record<string, DetailGroup> = {
  project_info: {
    label: 'Project information',
    icon: 'i-lucide-folder-open',
    keys: [
      'type', 'application', 'portal_id', 'customer_project_reference',
      'project_coordinator', 'project_category', 'organism',
      'reference_genome', 'funding_agency', 'sensitive_data', 'shared'
    ]
  },
  dates: {
    label: 'Dates',
    icon: 'i-lucide-calendar',
    keys: [
      'order_received', 'contract_received', 'contract_sent',
      'plates_sent', 'sample_information_received', 'samples_received',
      'queued', 'all_samples_sequenced', 'all_raw_data_delivered'
    ]
  },
  sequencing: {
    label: 'Sequencing',
    icon: 'i-lucide-dna',
    keys: [
      'sequencing_setup', 'sequencing_platform',
      'sequence_units_ordered_(lanes)', 'custom_primer',
      'low_diversity', 'flowcell'
    ]
  },
  library: {
    label: 'Library & sample',
    icon: 'i-lucide-flask-conical',
    keys: [
      'library_construction_method', 'sample_type', 'sample_units_ordered',
      'library_type_(ready-made_libraries)',
      'library_prep_option_single_cell_(hashing)',
      'library_prep_option_single_cell_(cite)',
      'library_prep_option_single_cell_(vdj)',
      'library_prep_option_single_cell_(feature)'
    ]
  },
  delivery: {
    label: 'Delivery',
    icon: 'i-lucide-truck',
    keys: [
      'delivery_type', 'best_practice_bioinformatics',
      'disposal_of_any_remaining_samples', 'custom_capture_design_id'
    ]
  },
  comments: {
    label: 'Comments',
    icon: 'i-lucide-message-square',
    keys: ['project_comment', 'customer_project_description']
  },
  signatures: {
    label: 'Signatures',
    icon: 'i-lucide-pen-tool',
    keys: [
      'signature_queued', 'signature_all_samples_sequenced',
      'signature_all_raw_data_delivered', 'signature_aborted'
    ]
  }
}

const EXCLUDED_KEYS = new Set([
  'links', 'running_notes', 'snic_checked', 'latest_sticky_note', 'aborted'
])

const ALL_GROUPED_KEYS = new Set(
  Object.values(DETAIL_GROUPS).flatMap(g => g.keys)
)

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\(([^)]+)\)/g, '($1)')
    .replace(/^\w/, c => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function getGroupEntries(groupKey: string) {
  if (!props.details) return []

  if (groupKey === 'other') {
    return Object.entries(props.details)
      .filter(([key, value]) =>
        !ALL_GROUPED_KEYS.has(key)
        && !EXCLUDED_KEYS.has(key)
        && value != null
        && String(value).trim() !== ''
      )
      .map(([key, value]) => ({
        key,
        label: formatLabel(key),
        value: formatValue(value)
      }))
  }

  const group = DETAIL_GROUPS[groupKey]
  if (!group) return []

  return group.keys
    .filter(key =>
      props.details?.[key] != null
      && String(props.details[key]).trim() !== ''
    )
    .map(key => ({
      key,
      label: formatLabel(key),
      value: formatValue(props.details![key])
    }))
}

const accordionItems = computed(() => {
  if (!props.details) return []

  const items: Array<{
    value: string
    label: string
    content: string
    _accordionTrigger?: { leading?: string }
  }> = []

  for (const [groupKey, group] of Object.entries(DETAIL_GROUPS)) {
    const entries = getGroupEntries(groupKey)
    if (entries.length > 0) {
      items.push({
        value: groupKey,
        label: `${group.label} (${entries.length})`,
        content: '',
        _accordionTrigger: { leading: group.icon }
      })
    }
  }

  const otherEntries = getGroupEntries('other')
  if (otherEntries.length > 0) {
    items.push({
      value: 'other',
      label: `Other (${otherEntries.length})`,
      content: '',
      _accordionTrigger: { leading: 'i-lucide-more-horizontal' }
    })
  }

  return items
})

const openGroups = ref<string[]>([])

watch(
  accordionItems,
  (items) => {
    const values = items.map(i => i.value)
    if (values.length === 0) {
      openGroups.value = []
      return
    }
    const valid = storedOpenGroups.value.filter(v => values.includes(v))
    openGroups.value = valid.length > 0 ? valid : [values[0]!]
  },
  { immediate: true }
)

watch(
  openGroups,
  (val) => {
    storedOpenGroups.value = val
  },
  { deep: true }
)

const parsedLinks = computed(() => parseDetailsLinks(props.details?.links))
</script>

<template>
  <NAlert
    v-if="!details"
    alert="border-gray"
    title="No details"
    description="Project details are not available."
    icon="i-lucide-info"
  />
  <div
    v-else
    class="space-y-6"
  >
    <NAccordion
      v-model="openGroups"
      :items="accordionItems"
      type="multiple"
      :_accordion-trigger="{
        btn: 'solid-gray',
        rounded: 'none'
      }"
    >
      <template #content="{ item }">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div
            v-for="entry in getGroupEntries(item.value)"
            :key="entry.key"
          >
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">{{ entry.label }}</span>
            <p class="font-medium mt-0.5">
              {{ entry.value }}
            </p>
          </div>
        </div>
      </template>
    </NAccordion>

    <div v-if="parsedLinks && Object.keys(parsedLinks).length > 0">
      <PageHeadline subsection="Links" />
      <div class="flex flex-wrap gap-3">
        <NHoverCard
          v-for="(link, key) in parsedLinks"
          :key="key"
        >
          <template #trigger>
            <NButton
              btn="soft-primary"
              size="sm"
            >
              {{ link.title || link.url || String(key) }}
            </NButton>
          </template>
          <template #content>
            <div class="space-y-2 text-sm">
              <p
                v-if="link.title"
                class="font-semibold"
              >
                {{ link.title }}
              </p>
              <p
                v-if="link.desc"
                class="text-muted"
              >
                {{ link.desc }}
              </p>
              <p
                v-if="link.user"
                class="text-muted"
              >
                Added by {{ link.user }}
                <span v-if="link.email"> ({{ link.email }})</span>
              </p>
              <p v-if="link.url">
                <a
                  :href="link.url"
                  target="_blank"
                  rel="noopener"
                  class="text-primary hover:underline break-all"
                >
                  {{ link.url }}
                </a>
              </p>
            </div>
          </template>
        </NHoverCard>
      </div>
    </div>
  </div>
</template>
