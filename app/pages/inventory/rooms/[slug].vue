<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { equipmentByRoomQuery, roomBySlugQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const roomSlug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const { state: roomState, asyncStatus: roomStatus } = useQueryColada(
  () => roomBySlugQuery(roomSlug.value)
)

const isLoading = computed(() => roomStatus.value === 'loading')
const isError = computed(() => roomState.value.status === 'error')
const errorMessage = computed(() => {
  if (roomState.value.status !== 'error') {
    return undefined
  }

  const message = roomState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading room details.'
})

const room = computed(() => roomState.value.status === 'success' ? roomState.value.data : null)

const roomDocumentId = computed(() => room.value?._id ?? '__pending_room__')

const {
  state: equipmentState,
  asyncStatus: equipmentStatus
} = useQueryColada(() => equipmentByRoomQuery(roomDocumentId.value))

const equipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const isLoadingEquipment = computed(() =>
  room.value != null && equipmentStatus.value === 'loading'
)

const isEquipmentError = computed(() =>
  room.value != null && equipmentState.value.status === 'error'
)

const equipmentErrorMessage = computed(() => {
  if (equipmentState.value.status !== 'error') {
    return undefined
  }

  const message = equipmentState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading storage equipment.'
})

const isAddEquipmentDialogOpen = ref(false)
const addEquipmentFormId = computed(() => `inventory-equipment-add-${roomDocumentId.value}`)

function onAddDialogOpenChange(open: boolean) {
  isAddEquipmentDialogOpen.value = open
}

function onEquipmentCreated() {
  isAddEquipmentDialogOpen.value = false
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="room ? room.name : 'Room details'"
      :description="room ? `${room.roomId}` : ''"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading room..."
      description="Fetching room details from the inventory database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading room"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="room == null"
      alert="border-warning"
      title="Room not found"
      description="No room exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <CardRoom
        :room="room"
        :link-to-details="false"
      />

      <NCard
        title="Storage equipment"
        description="Manage freezers, fridges, shelves, and nitrogen tanks in this room."
        card="outline-gray"
      >
        <div class="mt-4 flex justify-end">
          <NDialog
            :model-value="isAddEquipmentDialogOpen"
            title="Add storage equipment"
            description="Register new storage equipment in this room."
            scrollable
            @update:model-value="onAddDialogOpenChange"
          >
            <template #trigger>
              <NButton
                label="Add equipment"
                btn="soft-primary hover:outline-primary"
                leading="i-lucide-plus"
              />
            </template>

            <FormInventoryEquipmentAdd
              :room-document-id="room._id"
              :form-id="addEquipmentFormId"
              hide-submit
              @saved="onEquipmentCreated"
            />

            <template #footer>
              <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
                <NDialogClose>
                  <NButton
                    label="Cancel"
                    btn="soft-gray hover:outline-gray"
                    leading="i-lucide-x"
                  />
                </NDialogClose>
                <NButton
                  type="submit"
                  :form="addEquipmentFormId"
                  label="Add equipment"
                  btn="soft-primary hover:outline-primary"
                  trailing="i-lucide-check"
                />
              </div>
            </template>
          </NDialog>
        </div>

        <div class="mt-4 space-y-4">
          <NAlert
            v-if="isLoadingEquipment"
            alert="border-gray"
            title="Loading equipment..."
            description="Fetching storage equipment in this room."
            icon="i-lucide-loader-2"
          />

          <NAlert
            v-else-if="isEquipmentError"
            alert="border-error"
            title="Error loading equipment"
            :description="equipmentErrorMessage"
            icon="i-lucide-alert-circle"
          />

          <NAlert
            v-else-if="equipment.length === 0"
            alert="border-warning"
            title="No equipment registered"
            description="This room has no storage equipment yet."
            icon="i-lucide-thermometer-snowflake"
          />

          <div
            v-else
            class="grid grid-cols-1 gap-4"
          >
            <CardEquipment
              v-for="equipmentEntry in equipment"
              :key="equipmentEntry._id"
              :equipment="equipmentEntry"
              :room-document-id="room._id"
            />
          </div>
        </div>
      </NCard>

      <div class="flex justify-end">
        <NButton
          label="Back to rooms"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-arrow-left"
          to="/inventory/rooms"
        />
      </div>
    </div>
  </main>
</template>
