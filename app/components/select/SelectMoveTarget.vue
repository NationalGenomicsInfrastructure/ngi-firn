<script setup lang="ts">
export interface MoveTargetOption {
  /** Encoded as "<kind>:<slug>" since equipment and container slugs share no namespace. */
  value: string
  kind: 'equipment' | 'container'
  label: string
}

const props = defineProps<{
  modelValue?: string
  options: MoveTargetOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

type KindFilter = 'all' | 'equipment' | 'container'

const kindFilter = ref<KindFilter>('all')

const kindFilters: { value: KindFilter, label: string, icon: string }[] = [
  { value: 'all', label: 'All', icon: 'i-lucide-list' },
  { value: 'equipment', label: 'Equipment', icon: 'i-lucide-refrigerator' },
  { value: 'container', label: 'Containers', icon: 'i-lucide-package' }
]

const filteredOptions = computed(() =>
  kindFilter.value === 'all'
    ? props.options
    : props.options.filter(option => option.kind === kindFilter.value)
)

const selectedOption = computed({
  get: () => props.options.find(option => option.value === props.modelValue),
  set: (option: MoveTargetOption | undefined) => emit('update:modelValue', option?.value)
})

// Drop a selection that the kind filter has just hidden, so the footer button can't move
// items to a destination the user no longer sees.
watch(kindFilter, () => {
  const current = selectedOption.value
  if (current && !filteredOptions.value.includes(current)) {
    emit('update:modelValue', undefined)
  }
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <NButton
        v-for="filter in kindFilters"
        :key="filter.value"
        :label="filter.label"
        :leading="filter.icon"
        size="xs"
        :btn="kindFilter === filter.value ? 'soft-primary' : 'ghost-gray'"
        @click="kindFilter = filter.value"
      />
    </div>

    <NCombobox
      v-model="selectedOption"
      :items="filteredOptions"
      by="value"
      item-text="label"
      :_combobox-input="{ placeholder: 'Search by name...' }"
      text-empty="No destination matches."
    >
      <template #trigger>
        <span v-if="selectedOption">{{ selectedOption.label }}</span>
        <span v-else>Select destination...</span>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <NIcon
            :name="item.kind === 'equipment' ? 'i-lucide-refrigerator' : 'i-lucide-package'"
            class="text-primary-500"
          />
          {{ item.label }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
