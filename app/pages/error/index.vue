<script setup lang="ts">
definePageMeta({
  layout: 'public'
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    <div class="mx-auto max-w-xl rounded-md space-y-10">
      <div class="flex justify-center">
        <LogoFirn class="h-auto w-full max-w-[200px] min-h-[50px]" />
      </div>

      <div class="border border-base rounded-md p-4 text-center text-sm flex flex-col items-center space-y-4">
        <NAvatar 
            icon
            label="i-lucide-badge-alert"
            size="sm:3xl md:4xl lg:5xl"
            class="border-2 border-primary-600 dark:border-primary-400 
            rounded-full 
            text-primary-600 dark:text-primary-400 
            bg-primary-600/30 dark:bg-primary-400/30"
          />
          <h3 class="text-lg font-semibold">
            An error has occurred with Firn.
          </h3>
          <p class="text-muted">
            Sorry, something went wrong. Please try again later.
          </p>
        
        <NButton
          btn="ghost"
          label="Return to NGI Sweden"
          size="md"
          class="w-full"
          external
          to="https://ngisweden.scilifelab.se"
        />
      </div>
    </div>
  </main>
</template>
