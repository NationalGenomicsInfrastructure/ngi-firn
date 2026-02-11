<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  link: [{ rel: 'icon', href: '/icon.png' }]
})

useSeoMeta({
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  title: 'NGI Firn',
  description:
    'A Nuxt4 web application for the National Genomics Infrastructure of Sweden. It serves as laboratory inventory management system and a visualization layer for the data infrastructure',
  ogImage: '/social-image.png',
  twitterImage: '/social-image.png'
})
</script>

<template>
  <div class="dark:bg-primary-900/40 min-h-screen w-full">
    <NuxtLoadingIndicator
      :color="false"
      class="z-100 bg-primary/80"
    />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
