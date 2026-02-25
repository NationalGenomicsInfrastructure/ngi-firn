<script setup lang="ts">
definePageMeta({
  layout: 'private',
  // Middleware runs before the page; invalid project IDs redirect to /not-found. Type will include 'validate-project-id' after Nuxt regenerates types.
  middleware: ['validate-project-id']
})

// Get the project ID from the URL: app/pages/projects/details/[projectid].vue
const route = useRoute()
const projectId = computed(() => route.params.projectid as string)
</script>

<template>
  <div>
    <p>Project ID: {{ projectId }}</p>
  </div>
</template>