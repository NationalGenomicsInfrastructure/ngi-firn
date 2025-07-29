<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const { setOpen } = useSidebar()
const { session } = useUserSession()

onMounted(() => {
  setOpen(false)
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    Logged in!
    <div>
      <pre>{{ session }}</pre>
    </div>
  </main>
</template>
