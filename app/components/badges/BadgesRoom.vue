<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { ROOM_TYPE_OPTIONS } from '~/utils/inventory/rooms'

const props = defineProps<{
  roomType: Room['roomType']
  isActive?: boolean
}>()

const ROOM_TYPE_BADGE: Record<Room['roomType'], { badge: string, icon: string }> = {
  basement: { badge: 'solid-gray', icon: 'i-lucide-arrow-down-to-line' },
  laboratory: { badge: 'solid-primary', icon: 'i-lucide-flask-conical' },
  office: { badge: 'solid-success', icon: 'i-lucide-briefcase' },
  storage: { badge: 'solid-indigo', icon: 'i-lucide-package' },
  other: { badge: 'solid-gray', icon: 'i-lucide-shapes' }
}

const roomTypeLabel = computed(() =>
  ROOM_TYPE_OPTIONS.find(option => option.value === props.roomType)?.label ?? props.roomType
)

const roomTypeBadge = computed(() => ROOM_TYPE_BADGE[props.roomType])

const hasAnyBadge = computed(() => props.isActive != null || !!props.roomType)
</script>

<template>
  <div
    v-if="hasAnyBadge"
    class="flex flex-col items-end gap-2"
  >
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
