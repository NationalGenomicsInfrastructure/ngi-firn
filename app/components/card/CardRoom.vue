<script setup lang="ts">
import type { Room } from '~~/types/inventory'

const props = withDefaults(defineProps<{
  room: Room
  showOpenAction?: boolean
}>(), {
  showOpenAction: true
})

const BUILDING_LABELS: Record<Room['building'], string> = {
  alfa: 'Alfa',
  beta: 'Beta',
  gamma: 'Gamma',
  delta: 'Delta'
}

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
    class="h-full flex flex-col"
    :_card-content="{ class: 'flex flex-1 flex-col min-h-0' }"
  >
    <div class="flex flex-1 flex-col py-4 min-h-0">
      <header class="shrink-0 flex items-start justify-between gap-4">
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
        <div class="shrink-0 min-h-14 flex flex-col items-end justify-start">
          <BadgesRoom
            :room-type="room.roomType"
            :is-active="room.isActive"
          />
        </div>
      </header>

      <NSeparator class="shrink-0 my-4" />

      <div class="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm content-start">
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

      <NSeparator class="shrink-0 my-4" />

      <footer class="shrink-0 flex flex-col-reverse items-center gap-2 sm:flex-row sm:justify-center">
        <DialogInventoryRoomUpdate :room="room" />
        <NButton
          v-if="showOpenAction"
          label="Open room"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-chevron-right"
          :to="roomDetailPath"
        />
      </footer>
    </div>
  </NCard>
</template>
