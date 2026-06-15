<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { roomBySlugQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const selectedSlug = ref<string | null>(null)

const { state: roomState, asyncStatus: roomStatus } = useQueryColada(
  () => ({
    ...roomBySlugQuery(selectedSlug.value ?? ''),
    enabled: selectedSlug.value != null && selectedSlug.value.length > 0
  })
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
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back to equipment"
        to="/inventory/equipment"
      />
    </div>
    <PageTitle
      title="Add equipment to room"
    />

    <NCard
      card="soft-gray"
      class="w-full my-auto"
      :_card-content="{ class: 'p-1' }"
    >
      <div class="p-4 flex items-center gap-2 m-auto">
          <h4 class='text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium'>
            Add equipment to
          </h4>
          <SelectRoom
            v-model="selectedSlug"
          />
          <h4 class='text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium'>
            or
          </h4>
          <NButton
            leading="i-lucide-building-2"
            btn="soft-primary hover:outline-primary"
            size="sm"
            to="/inventory/rooms/add"
          >
          Create a new room
        </NButton>
      </div>
    </NCard>

    <NAlert
      v-if="selectedSlug && isLoading"
      alert="border-gray"
      title="Loading room..."
      description="Fetching room details from the inventory database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="selectedSlug && isError"
      alert="border-error"
      title="Error loading room"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="selectedSlug && room == null"
      alert="border-warning"
      title="Room not found"
      description="No room exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-if="room"
      class="mt-6 space-y-6"
    >
      <InventoryRoomEquipmentSection :room="room" />

      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to equipment"
          to="/inventory/equipment"
        />
      </div>
    </div>
  </main>
</template>
