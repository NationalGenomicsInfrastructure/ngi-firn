<script setup lang="ts">
// Only show the button if the user is an admin.
// Since all admin actions are properly validated at tRPC level and the page's route is inaccessible to non-admins,
// a simple client-side check to display the button is sufficient.
const { user } = useUserSession()
const { setOpen } = useSidebar()
</script>

<template>
  <NButton
    v-if="user?.isAdminClientside"
    btn="soft"
    label="i-lucide-key-round"
    class="text-color-amber-800 dark:text-color-amber-300"
    icon
    @click="setOpen(true); navigateTo('/administration')"
  />
</template>
