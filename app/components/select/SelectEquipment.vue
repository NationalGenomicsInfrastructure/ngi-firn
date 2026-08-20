<script setup lang="ts">
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { useQuery } from '@pinia/colada'
import { allEquipmentQuery } from '~/utils/queries/inventory/equipment'

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const { data: equipment } = useQuery(allEquipmentQuery)

const items = computed(() => equipment.value ?? [])

const selectedEquipment = computed({
  get: () => items.value.find(r => r.slug === props.modelValue) ?? undefined,
  set: (value: DisplayStorageEquipment | undefined) => emit('update:modelValue', value?.slug)
})

function displayName(equipment: DisplayStorageEquipment): string {
  const parts = [equipment.name]
  if (equipment.label) parts.push(`(${equipment.label})`)
  return parts.join(' ')
}
</script>

<template>
  <div class="flex">
    <NCombobox
      v-model="selectedEquipment"
      :items="items"
      by="slug"
      item-text="name"
      :_combobox-input="{
        placeholder: 'Select equipment...'
      }"
      text-empty="No equipment found."
    >
      <template #trigger>
        <template v-if="selectedEquipment">
          <div
            :key="selectedEquipment.slug"
            class="flex items-center gap-2"
          >
            <NIcon
              name="i-lucide-refrigerator"
              class="text-primary-500"
            />
            {{ displayName(selectedEquipment) }}
          </div>
        </template>
        <template v-else>
          Select equipment...
        </template>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <NIcon
            name="i-lucide-refrigerator"
            class="text-primary-500"
          />
          {{ displayName(item) }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
