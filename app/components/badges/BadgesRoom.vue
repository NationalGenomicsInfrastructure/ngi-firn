<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { ROOM_TYPE_BADGE_STYLES, getRoomTypeLabel } from '~/utils/inventory/room'

const props = defineProps<{
  roomType: Room['roomType']
  isActive?: boolean
}>()

const roomTypeLabel = computed(() => getRoomTypeLabel(props.roomType))
const roomTypeBadge = computed(() => ROOM_TYPE_BADGE_STYLES[props.roomType])
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <NBadge
      v-if="isActive != null"
      :badge="isActive ? 'solid-success' : 'solid-warning'"
      :label="isActive ? 'Active' : 'Inactive'"
      :icon="isActive ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
    />
    <NBadge
      v-if="roomType"
      :badge="roomTypeBadge.badge"
      :icon="roomTypeBadge.icon"
      :label="roomTypeLabel"
    />
  </div>
</template>
