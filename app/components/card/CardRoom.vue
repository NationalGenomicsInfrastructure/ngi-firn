<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { NLink } from '#components'

const props = withDefaults(defineProps<{
  room: Room
  linkToDetails?: boolean
}>(), {
  linkToDetails: true
})

const BUILDING_LABELS: Record<Room['building'], string> = {
  alfa: 'Alfa',
  beta: 'Beta',
  gamma: 'Gamma',
  delta: 'Delta'
}

const buildingLabel = computed(() => BUILDING_LABELS[props.room.building] ?? props.room.building)
const roomDetailPath = computed(() => `/inventory/rooms/${encodeURIComponent(props.room.slug)}`)

const infoFields = computed(() => [
  { icon: 'i-lucide-key-round', label: 'Room identifier', value: props.room.slug },
  { icon: 'i-lucide-building-2', label: 'Building', value: buildingLabel.value },
  { icon: 'i-lucide-door-open', label: 'Room number', value: props.room.roomNumber ?? '—' },
  { icon: 'i-lucide-layers', label: 'Floor', value: props.room.floor == null ? '—' : String(props.room.floor) },
  { icon: 'i-lucide-align-left', label: 'Description', value: props.room.description ?? '—' }
])

const cardBodyTag = computed(() => (props.linkToDetails ? NLink : 'div'))
const cardBodyBind = computed(() => (props.linkToDetails ? { to: roomDetailPath.value } : {}))

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)
</script>

<template>
  <NCard
    card="outline-gray"
    class="h-full flex flex-col"
    :class="linkToDetails ? 'transition-colors hover:border-primary-400 dark:hover:border-primary-500' : undefined"
    :_card-content="{ class: 'flex flex-1 flex-col min-h-0' }"
  >
    <div class="flex flex-1 flex-col py-4 min-h-0">
      <component
        :is="cardBodyTag"
        v-bind="cardBodyBind"
        class="flex flex-1 flex-col min-h-0 no-underline text-inherit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        :class="linkToDetails ? 'cursor-pointer hover:bg-muted/30 -mx-1 px-1 transition-colors' : undefined"
      >
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
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>
      </component>

      <NSeparator class="shrink-0 my-4" />

      <footer class="shrink-0 flex flex-wrap items-center justify-center gap-2">
        <DialogInventoryRoomUpdate :room="room" />
        <DialogDeleteRoom
          v-if="isAdmin"
          :room="room"
        />
      </footer>
    </div>
  </NCard>
</template>
