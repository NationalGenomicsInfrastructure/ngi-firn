<script setup lang="ts">
import type { Room } from '~~/types/inventory'

const props = withDefaults(defineProps<{
  room: Room
  showOpenAction?: boolean
}>(), {
  showOpenAction: true
})

const ROOM_TYPE_LABELS: Record<Room['roomType'], string> = {
  basement: 'Basement',
  laboratory: 'Laboratory',
  office: 'Office',
  storage: 'Storage',
  other: 'Other'
}

const BUILDING_LABELS: Record<Room['building'], string> = {
  alfa: 'Alfa',
  beta: 'Beta',
  gamma: 'Gamma',
  delta: 'Delta'
}

const roomTypeLabel = computed(() => ROOM_TYPE_LABELS[props.room.roomType] ?? props.room.roomType)
const buildingLabel = computed(() => BUILDING_LABELS[props.room.building] ?? props.room.building)
const roomDetailPath = computed(() => `/inventory/rooms/${encodeURIComponent(props.room.roomId)}`)

const infoFields = computed(() => [
  { icon: 'i-lucide-key-round', label: 'Room identifier', value: props.room.roomId },
  { icon: 'i-lucide-building-2', label: 'Building', value: buildingLabel.value },
  { icon: 'i-lucide-door-open', label: 'Room number', value: props.room.roomNumber ?? '—' },
  { icon: 'i-lucide-layers', label: 'Floor', value: props.room.floor == null ? '—' : String(props.room.floor) },
  { icon: 'i-lucide-align-left', label: 'Description', value: props.room.description ?? '—' }
])
</script>

<template>
  <NCard
    card="outline-gray"
    class="h-full py-4"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
          Room
        </p>
        <h3 class="text-lg font-semibold truncate">
          {{ room.name }}
        </h3>
        <p class="text-sm text-muted truncate">
          {{ room.label }}
        </p>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        <NBadge
          :una="{ badgeDefaultVariant: room.isActive ? 'solid-success' : 'solid-gray' }"
          :label="room.isActive ? 'Active' : 'Inactive'"
        />
        <NBadge
          :una="{ badgeDefaultVariant: 'solid-primary' }"
          :label="roomTypeLabel"
        />
      </div>
    </div>

    <NSeparator class="my-4" />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
      <div
        v-for="field in infoFields"
        :key="field.label"
      >
        <div class="flex items-center gap-1.5 mb-0.5">
          <NIcon
            :name="field.icon"
            class="text-primary-400 dark:text-primary-600 text-xs"
          />
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
            {{ field.label }}
          </span>
        </div>
        <p class="font-medium pl-5">
          {{ field.value }}
        </p>
      </div>
    </div>

    <template v-if="showOpenAction">
      <NSeparator class="my-4" />

      <div class="flex justify-end">
        <NButton
          label="Open room"
          btn="soft-primary hover:outline-primary"
          trailing="i-lucide-chevron-right"
          :to="roomDetailPath"
        />
      </div>
    </template>
  </NCard>
</template>
