<script setup lang="ts">

definePageMeta({
  layout: 'private',
  validate: (route) => {
    return /^P[0-9]+$/.test(route.params.projectid as string)
  }
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