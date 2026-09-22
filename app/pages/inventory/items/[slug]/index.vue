<script setup lang="ts">
const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug

// Keep the canonical item URL on its details page.
navigateTo(`/inventory/items/${encodeURIComponent(slug ?? '')}/details`, { replace: true })
</script>

<template>
  <div>
    <h1>Redirecting to item details.</h1>
  </div>
</template>
