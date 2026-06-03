<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { Room } from '~~/types/inventory'
import { allRoomsQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium'

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

const ANY_VALUE = 'any'
const NO_FLOOR_VALUE = 'none'

const { state: roomsState, asyncStatus: roomsStatus } = useQueryColada(allRoomsQuery)

const isLoading = computed(() => roomsStatus.value === 'loading')
const isError = computed(() => roomsState.value.status === 'error')
const errorMessage = computed(() => {
  if (roomsState.value.status !== 'error') {
    return undefined
  }

  const message = roomsState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading rooms.'
})

const rooms = computed(() => roomsState.value.status === 'success' ? roomsState.value.data : [])

const selectedRoomType = ref<typeof ANY_VALUE | Room['roomType']>(ANY_VALUE)
const selectedBuilding = ref<typeof ANY_VALUE | Room['building']>(ANY_VALUE)
const selectedFloor = ref(ANY_VALUE)

const roomTypeOptions = computed(() => [
  { value: ANY_VALUE, label: 'Any room type' },
  ...Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({ value, label }))
])

const buildingOptions = computed(() => {
  const buildings = Array.from(new Set(rooms.value.map(room => room.building))).sort((a, b) => a.localeCompare(b))
  return [
    { value: ANY_VALUE, label: 'Any building' },
    ...buildings.map(building => ({ value: building, label: BUILDING_LABELS[building] ?? building }))
  ]
})

const floorOptions = computed(() => {
  const floors = Array.from(new Set(
    rooms.value
      .map(room => room.floor)
      .filter((floor): floor is number => floor != null)
  )).sort((a, b) => a - b)

  const hasNoFloor = rooms.value.some(room => room.floor == null)
  const options = [{ value: ANY_VALUE, label: 'Any floor' }, ...floors.map(floor => ({ value: String(floor), label: `Floor ${floor}` }))]

  if (hasNoFloor) {
    options.push({ value: NO_FLOOR_VALUE, label: 'No floor set' })
  }

  return options
})

const filteredRooms = computed(() => {
  return rooms.value.filter((room) => {
    const roomTypeMatch = selectedRoomType.value === ANY_VALUE || room.roomType === selectedRoomType.value
    const buildingMatch = selectedBuilding.value === ANY_VALUE || room.building === selectedBuilding.value

    const floorMatch
      = selectedFloor.value === ANY_VALUE
        || (selectedFloor.value === NO_FLOOR_VALUE ? room.floor == null : String(room.floor) === selectedFloor.value)

    return roomTypeMatch && buildingMatch && floorMatch
  })
})

function onRoomTypeFilterUpdate(value: unknown) {
  const next = value as typeof ANY_VALUE | Room['roomType'] | null | undefined
  selectedRoomType.value = next ?? ANY_VALUE
}

function onBuildingFilterUpdate(value: unknown) {
  selectedBuilding.value = (value as typeof ANY_VALUE | Room['building'] | null | undefined) ?? ANY_VALUE
}

function onFloorFilterUpdate(value: unknown) {
  selectedFloor.value = (value as string | null | undefined) ?? ANY_VALUE
}

function clearFilters() {
  selectedRoomType.value = ANY_VALUE
  selectedBuilding.value = ANY_VALUE
  selectedFloor.value = ANY_VALUE
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Rooms"
      description="View the rooms available in the inventory system."
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading rooms..."
      description="Fetching room data from the inventory database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading rooms"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="rooms.length === 0"
      alert="border-warning"
      title="No rooms found"
      description="No inventory rooms are available yet."
      icon="i-lucide-building-2"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-4"
    >
      <NCard card="soft-gray">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NFormField
            name="roomType"
            label="Room type"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="selectedRoomType"
              :items="roomTypeOptions"
              by="value"
              @update:model-value="onRoomTypeFilterUpdate"
            />
          </NFormField>

          <NFormField
            name="building"
            label="Building"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="selectedBuilding"
              :items="buildingOptions"
              by="value"
              @update:model-value="onBuildingFilterUpdate"
            />
          </NFormField>

          <NFormField
            name="floor"
            label="Floor"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="selectedFloor"
              :items="floorOptions"
              by="value"
              @update:model-value="onFloorFilterUpdate"
            />
          </NFormField>
        </div>
        <div class="mt-4 flex justify-end">
          <NButton
            label="Clear filters"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-filter-x"
            @click="clearFilters"
          />
        </div>
      </NCard>

      <NAlert
        v-if="filteredRooms.length === 0"
        alert="border-warning"
        title="No matching rooms"
        description="No rooms match the selected filters."
        icon="i-lucide-filter-x"
      />

      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <CardRoom
          v-for="room in filteredRooms"
          :key="room._id"
          :room="room"
        />
      </div>
    </div>
  </main>
</template>
