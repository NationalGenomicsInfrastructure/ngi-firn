<script setup lang="ts">
const { loggedIn } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
}, { immediate: true })
</script>

<template>
  <NSidebarProvider>
    <NavigationSidebarMain />
    <NToaster />
    <main>
      <slot />
    </main>
  </NSidebarProvider>
</template>
