<script setup lang="ts">
// No standalone barcode index yet; the action-card sheet is the only barcode page.
// Redirect so the intermediate breadcrumb segment resolves to a real route.
definePageMeta({
  layout: 'private'
})

await navigateTo('/inventory/barcodes/actions', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
