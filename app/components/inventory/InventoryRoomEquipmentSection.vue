<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { Room } from '~~/types/inventory'
import { equipmentByRoomQuery } from '~/utils/queries/inventory/equipment'

const props = defineProps<{
  room: Room
}>()

const {
  state: equipmentState,
  asyncStatus: equipmentStatus
} = useQueryColada(() => equipmentByRoomQuery(props.room._id))

const equipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const isLoadingEquipment = computed(() => equipmentStatus.value === 'loading')
const isEquipmentError = computed(() => equipmentState.value.status === 'error')

const equipmentErrorMessage = computed(() => {
  if (equipmentState.value.status !== 'error') {
    return undefined
  }

  const message = equipmentState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading storage equipment.'
})
</script>

<template>
  <PageHeadline
    section="Storage equipment in this room"
  />
  <NTabs default-value="list">
    <NTabsList class="mx-auto">
      <NTabsTrigger value="list">
        <NIcon name="i-lucide-list" />
        List equipment
      </NTabsTrigger>
      <NTabsTrigger value="add">
        <NIcon name="i-lucide-plus" />
        Add equipment
      </NTabsTrigger>
    </NTabsList>

    <NTabsContent
      value="list"
      class="mt-4"
    >
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
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <CardEquipment
          v-for="equipmentEntry in equipment"
          :key="equipmentEntry._id"
          :equipment="equipmentEntry"
          :room-document-id="room._id"
        />
      </div>
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryEquipmentAdd :room-document-id="room._id" />
    </NTabsContent>
  </NTabs>
</template>
