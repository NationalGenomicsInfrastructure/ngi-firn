<script setup lang="ts">
  const { $trpc } = useNuxtApp() // get the tRPC client
  const { data: hello } = await $trpc.hello.useQuery({ text: 'Hello visitor'  })
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="font-medium">
      Welcome to Firn.
    </p>
    <div
      class="group relative max-w-[400px]"
    >
      <img
        src="@/assets/images/logos/ngi.png"
        alt="Logo of the National Genomics Infrastructure Sweden"
        class="w-full rounded aspect-1 bg-sky-900"
        loading="lazy"
          >
      </div>
    <p>{{ hello?.greeting }}</p>
    
    <USeparator />
    <p class="text-sm text-(--ui-text-muted)">
      **Firn** refers to compacted, granular snow on mountain tops and glaciers that has survived at least one summer melt season. The word originates from Swiss-German "firn" meaning "of last year" and has been adopted into many languages.
    </p>
  </div>
</template>
