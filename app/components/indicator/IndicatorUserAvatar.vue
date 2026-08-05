<script setup lang="ts">
import type { SerializedUserRef } from '~~/types/inventory'

const props = withDefaults(defineProps<{
  user: SerializedUserRef
  /* Show the user's name next to the avatar. */
  showName?: boolean
}>(), {
  showName: true
})

const initials = computed(() => {
  const parts = props.user.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
})
</script>

<template>
  <div class="flex items-center gap-2 min-w-0">
    <NAvatar
      :src="user.avatar ?? undefined"
      :alt="user.name"
      square="4"
      avatar="solid-primary"
    >
      <template #fallback>
        <span class="inline-flex items-center leading-none text-primary-200 dark:text-primary-100 font-semibold text-xs">
          {{ initials }}
        </span>
      </template>
    </NAvatar>
    <span
      v-if="showName"
      class="truncate text-sm font-medium"
    >
      {{ user.name }}
    </span>
  </div>
</template>
