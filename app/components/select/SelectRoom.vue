<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { useQuery } from '@pinia/colada'
import { allRoomsQuery } from '~/utils/queries/inventory/rooms'

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const { data: rooms } = useQuery(allRoomsQuery)

const items = computed(() => rooms.value ?? [])

const selectedRoom = computed({
  get: () => items.value.find(r => r.slug === props.modelValue) ?? undefined,
  set: (value: Room | undefined) => emit('update:modelValue', value?.slug)
})

function displayName(room: Room): string {
  const parts = [room.name]
  if (room.label) parts.push(`(${room.label})`)
  return parts.join(' ')
}
</script>

<template>
  <div class="flex">
    <NCombobox
      v-model="selectedRoom"
      :items="items"
      by="slug"
      :_combobox-input="{
        placeholder: 'Select room...'
      }"
    >
      <template #trigger>
        <template v-if="selectedRoom">
          <div
            :key="selectedRoom.slug"
            class="flex items-center gap-2"
          >
            <NIcon
              name="i-lucide-door-open"
              class="text-primary-500"
            />
            {{ displayName(selectedRoom) }}
          </div>
        </template>
        <template v-else>
          Select room...
        </template>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <NIcon
            name="i-lucide-door-open"
            class="text-primary-500"
          />
          {{ displayName(item) }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
