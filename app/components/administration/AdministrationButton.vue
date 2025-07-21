<script setup lang="ts">
// Only show the button if the user is an admin.
// Since all admin actions are properly validated at tRPC level and the page's route is inaccessible to non-admins,
// a simple client-side check to display the button is sufficient.
const { user } = useUserSession()
</script>

<template>
  <NButton
    v-if="user?.isAdminClientside"
    btn="ghost"
    label="i-lucide-user-cog"
    icon
    @click="navigateTo('/administration')"
  />
</template>