<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const { setOpen } = useSidebar()
const { session } = useUserSession()
const { authStatusWatcher } = useAuthStatusToast()

onMounted(() => {
  setOpen(false)
  if (session.value?.authStatus) {
    session.value.authStatus = undefined
  }
})

onUnmounted(() => {
  if (authStatusWatcher) {
    authStatusWatcher()
  }
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    <NCard>
      <template #header>
        <h1 class="text-2xl font-bold">
          Welcome to the Firn dashboard!
        </h1>
      </template>
    </NCard>
  </main>
</template>
