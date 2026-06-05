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

const filterInitialValues = {
  roomType: ANY_VALUE as typeof ANY_VALUE | Room['roomType'],
  building: ANY_VALUE as typeof ANY_VALUE | Room['building'],
  floor: ANY_VALUE
}

const { resetForm } = useForm({ initialValues: filterInitialValues })

// Bind fields explicitly so NFormField + NSelect stay in sync when filters are cleared programmatically
const { value: selectedRoomType, setValue: setRoomType } = useField<typeof ANY_VALUE | Room['roomType']>('roomType')
const { value: selectedBuilding, setValue: setBuilding } = useField<typeof ANY_VALUE | Room['building']>('building')
const { value: selectedFloor, setValue: setFloor } = useField<string>('floor')

// useField is undefined until NFormField mounts; treat that as "any" so all rooms show on first load
const effectiveRoomType = computed(() => selectedRoomType.value ?? ANY_VALUE)
const effectiveBuilding = computed(() => selectedBuilding.value ?? ANY_VALUE)
const effectiveFloor = computed(() => selectedFloor.value ?? ANY_VALUE)

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
    const roomTypeMatch = effectiveRoomType.value === ANY_VALUE || room.roomType === effectiveRoomType.value
    const buildingMatch = effectiveBuilding.value === ANY_VALUE || room.building === effectiveBuilding.value

    const floorMatch
      = effectiveFloor.value === ANY_VALUE
        || (effectiveFloor.value === NO_FLOOR_VALUE ? room.floor == null : String(room.floor) === effectiveFloor.value)

    return roomTypeMatch && buildingMatch && floorMatch
  })
})

function clearFilters() {
  resetForm({ values: filterInitialValues })
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
      <NCard
        title="Filter rooms"
        description="Find rooms matching your criteria."
        card="soft-gray"
        class="w-full"
        :una="{
          cardContent: 'space-y-4',
          cardDescription: 'text-accent'
        }"
      >
        <div class="mb-6 flex flex-wrap items-end gap-4">
          <NFormField
            name="roomType"
            label="Room type"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="effectiveRoomType"
              :items="roomTypeOptions"
              by="value"
              @update:model-value="(v: unknown) => setRoomType((v as typeof ANY_VALUE | Room['roomType'] | null | undefined) ?? ANY_VALUE)"
            />
          </NFormField>

          <NFormField
            name="building"
            label="Building"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="effectiveBuilding"
              :items="buildingOptions"
              by="value"
              @update:model-value="(v: unknown) => setBuilding((v as typeof ANY_VALUE | Room['building'] | null | undefined) ?? ANY_VALUE)"
            />
          </NFormField>

          <NFormField
            name="floor"
            label="Floor"
            :una="{ formLabel: FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="effectiveFloor"
              :items="floorOptions"
              by="value"
              @update:model-value="(v: unknown) => setFloor((v as string | null | undefined) ?? ANY_VALUE)"
            />
          </NFormField>

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
        <NuxtLink
          to="/inventory/rooms/add"
          class="block h-full no-underline text-inherit group"
        >
          <NCard
            card="outline-gray"
            class="h-full transition-colors group-hover:border-primary-400 dark:group-hover:border-primary-500"
            :_card-content="{ class: 'flex flex-1 flex-col min-h-0' }"
          >
            <div class="flex flex-1 flex-col items-center justify-center text-center my-20">
              <div
                class="flex items-center justify-center size-20 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 transition-colors group-hover:bg-primary-200 dark:group-hover:bg-primary-900/60"
              >
                <span class="flex items-center justify-center">
                  <NIcon
                    name="i-lucide-plus"
                    class="text-6xl"
                  />
                </span>
              </div>
              <p class="text-xl font-semibold text-primary-600 dark:text-primary-400">
                Add new room
              </p>
            </div>
          </NCard>
        </NuxtLink>
      </div>
    </div>
  </main>
</template>
