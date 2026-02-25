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

      <div class="border-1 border-primary-600 dark:border-primary-400 rounded-md p-4 text-center text-sm flex flex-col items-center space-y-4 bg-primary-50 dark:bg-primary-700">
        <NAvatar
          icon
          src="/ui/firn-error_carrot-updating-or-repairing_by-David-Revoy.webp" 
          alt="'Carrot updating or repairing' by David Revoy, licensed under Creative Commons Attribution 4.0."
          size="sm:3xl md:4xl lg:6xl"
          class="border-1 border-primary-600 dark:border-primary-400 shadow-sm shadow-primary-200 dark:shadow-primary-400
            rounded-full dark:opacity-75"
        />
        <p class="text-muted">
          <NLink href="https://www.peppercarrot.com/en/viewer/misc__2016-04-13_carrot-updating-or-repairing_by-David-Revoy.html" target="_blank" external>
            <em>'Carrot updating or repairing'</em> by David Revoy,<br><NLink href="https://creativecommons.org/licenses/by/4.0/" target="_blank" external>Creative Commons Attribution 4.0</NLink> licensed.
          </NLink>
        </p>
        <h1 class="scroll-m-20 text-center font-display font-semibold text-primary-600 dark:text-primary-400 tracking-tight text-display text-2xl lg:text-3xl">
          Sorry, we have technical difficulties at the moment.
        </h1>

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
