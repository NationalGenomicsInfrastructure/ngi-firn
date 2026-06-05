<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { roomBySlugQuery } from '~/utils/queries/inventory/rooms'

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

      <InventoryRoomEquipmentSection :room="room" />

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
