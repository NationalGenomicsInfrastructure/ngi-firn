<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const { setOpen } = useSidebar()

onMounted(() => {
  setOpen(false)
})

</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    Logged in!
  </main>
</template>
