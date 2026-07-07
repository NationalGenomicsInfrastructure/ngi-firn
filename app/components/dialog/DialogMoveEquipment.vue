<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { allRoomsQuery } from '~/utils/queries/inventory/rooms'
import { moveEquipmentToRoom as useMoveEquipmentMutation } from '~/utils/mutations/inventory/equipment'

const props = defineProps<{
  equipment: DisplayStorageEquipment
}>()

const { showError } = useFirnToast()

const isDialogOpen = ref(false)
const selectedRoomSlug = ref<string | undefined>()

const { state: roomsState, asyncStatus: roomsStatus } = useQueryColada(allRoomsQuery)

const availableRooms = computed(() =>
  roomsState.value.status === 'success'
    ? roomsState.value.data.filter(room => room.slug !== props.equipment.parentRoom.slug)
    : []
)

const roomOptions = computed(() =>
  availableRooms.value.map(room => ({
    value: room.slug,
    label: `${room.name} (${room.slug})`
  }))
)

const isLoadingRooms = computed(() => roomsStatus.value === 'loading')

const isMoveDisabled = computed(() =>
  isLoadingRooms.value
  || roomOptions.value.length === 0
  || selectedRoomSlug.value == null
)

watch(isDialogOpen, (isOpen) => {
  if (isOpen) {
    selectedRoomSlug.value = roomOptions.value[0]?.value
  }
})

watch(roomOptions, (options) => {
  if (!isDialogOpen.value) {
    return
  }

  if (!selectedRoomSlug.value && options.length > 0) {
    const firstOption = options[0]
    if (firstOption) {
      selectedRoomSlug.value = firstOption.value
    }
  }
})

function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
}

function onTargetRoomUpdate(value: unknown) {
  if (typeof value === 'string') {
    selectedRoomSlug.value = value
    return
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const optionValue = (value as { value?: unknown }).value
    if (typeof optionValue === 'string') {
      selectedRoomSlug.value = optionValue
    }
  }
}

const { mutateAsync: moveEquipmentAsync } = useMoveEquipmentMutation()

async function handleMove() {
  if (!selectedRoomSlug.value) {
    showError('Please select a destination room.', 'Move equipment')
    return
  }

  const result = await moveEquipmentAsync({
    equipmentSlug: props.equipment.slug,
    newRoomSlug: selectedRoomSlug.value
  })

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
          :model-value="selectedRoomSlug"
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
