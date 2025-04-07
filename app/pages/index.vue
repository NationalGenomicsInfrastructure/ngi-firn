<script setup lang="ts">
  const { $trpc } = useNuxtApp() // get the tRPC client
  const { data: hello } = await $trpc.hello.useQuery({ text: 'Hello visitor'  })
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="font-medium">
      Welcome to Noetic.
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
      The adjective noetic means "<i>of, relating to, or based on the intellect</i>." and can be considered a synonym for "thoughtful". It is derived from the Greek word noesis, meaning "purely intellectual knowledge" and can also refer to "an act of thinking."
    </p>
  </div>
</template>
