<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'
import { useQuery } from '@pinia/colada'
import { allContainersQuery } from '~/utils/queries/inventory/containers'

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const { data: containers } = useQuery(allContainersQuery)

const items = computed(() => containers.value ?? [])

const selectedContainer = computed({
  get: () => items.value.find(c => c.slug === props.modelValue) ?? undefined,
  set: (value: DisplayContainer | undefined) => emit('update:modelValue', value?.slug)
})

function displayName(container: DisplayContainer): string {
  const parts = [container.name]
  if (container.label) parts.push(`(${container.label})`)
  return parts.join(' ')
}
</script>

<template>
  <div class="flex">
    <NCombobox
      v-model="selectedContainer"
      :items="items"
      by="slug"
      item-text="name"
      :_combobox-input="{
        placeholder: 'Select container...'
      }"
    >
      <template #trigger>
        <template v-if="selectedContainer">
          <div
            :key="selectedContainer.slug"
            class="flex items-center gap-2"
          >
            <NIcon
              name="i-lucide-package"
              class="text-primary-500"
            />
            {{ displayName(selectedContainer) }}
          </div>
        </template>
        <template v-else>
          Select container...
        </template>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <NIcon
            name="i-lucide-package"
            class="text-primary-500"
          />
          {{ displayName(item) }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
