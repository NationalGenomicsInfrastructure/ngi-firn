<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { StorageEquipment } from '~~/types/inventory'
import { allRoomsQuery } from '~/utils/queries/inventory/rooms'
import { moveEquipmentToRoom as useMoveEquipmentMutation } from '~/utils/mutations/inventory/rooms'

const props = defineProps<{
  equipment: StorageEquipment
}>()

const { showError } = useFirnToast()

const isDialogOpen = ref(false)
const selectedRoomId = ref<string | undefined>()

const { state: roomsState, asyncStatus: roomsStatus } = useQueryColada(allRoomsQuery)

const availableRooms = computed(() =>
  roomsState.value.status === 'success'
    ? roomsState.value.data.filter(room => room._id !== props.equipment.parent?.id)
    : []
)

const roomOptions = computed(() =>
  availableRooms.value.map(room => ({
    value: room._id,
    label: `${room.name} (${room.slug})`
  }))
)

const isLoadingRooms = computed(() => roomsStatus.value === 'loading')

const isMoveDisabled = computed(() =>
  isLoadingRooms.value
  || roomOptions.value.length === 0
  || selectedRoomId.value == null
)

watch(isDialogOpen, (isOpen) => {
  if (isOpen) {
    selectedRoomId.value = roomOptions.value[0]?.value
  }
})

watch(roomOptions, (options) => {
  if (!isDialogOpen.value) {
    return
  }

  if (!selectedRoomId.value && options.length > 0) {
    const firstOption = options[0]
    if (firstOption) {
      selectedRoomId.value = firstOption.value
    }
  }
})

function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
}

function onTargetRoomUpdate(value: unknown) {
  if (typeof value === 'string') {
    selectedRoomId.value = value
    return
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const optionValue = (value as { value?: unknown }).value
    if (typeof optionValue === 'string') {
      selectedRoomId.value = optionValue
    }
  }
}

async function handleMove() {
  if (!selectedRoomId.value) {
    showError('Please select a destination room.', 'Move equipment')
    return
  }

  const { mutateAsync } = useMoveEquipmentMutation()
  const result = await mutateAsync({
    equipmentId: props.equipment._id,
    newRoomId: selectedRoomId.value
  })

  // Close the dialog if the move was successful
  if (result) {
    isDialogOpen.value = false
  }
}
</script>

<template>
  <NDialog
    :model-value="isDialogOpen"
    title="Move equipment"
    description="Select a destination room for this equipment."
    @update:model-value="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Move"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-combine"
      />
    </template>

    <div class="p-4 space-y-4">
      <NAlert
        v-if="!isLoadingRooms && roomOptions.length === 0"
        alert="border-warning"
        title="No destination available"
        description="No other rooms are available for moving this equipment."
        icon="i-lucide-map-pin-off"
      />

      <NFormField
        v-else-if="!isLoadingRooms"
        name="targetRoom"
        label="Destination room"
        :una="{ formLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSelect
          :model-value="selectedRoomId"
          :items="roomOptions"
          by="value"
          @update:model-value="onTargetRoomUpdate"
        />
      </NFormField>

      <NAlert
        v-else
        alert="border-gray"
        title="Loading rooms..."
        description="Fetching available destination rooms."
        icon="i-lucide-loader-2"
      />
    </div>

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
          label="Move to room"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-combine"
          :disabled="isMoveDisabled"
          @click="handleMove"
        />
      </div>
    </template>
  </NDialog>
</template>
