<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'

definePageMeta({
  layout: 'private'
})

const selectedUser = ref<DisplayUserToUsers | undefined>()
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Tasks"
      description="Manage your tasks."
    />
    <SelectFirnUsers
      v-model="selectedUser"
    />
    {{ selectedUser }}
  </main>
</template>