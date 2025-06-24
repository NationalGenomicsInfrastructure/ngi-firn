<script setup lang="ts">
const toast = useToast()

const error = useRoute().query?.error
onMounted(() => {
  if (error) {
    toast.add({
      color: 'red',
      title: error,
    })
  }
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator :color="false" class="z-100 bg-primary/80" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
