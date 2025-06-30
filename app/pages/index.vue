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

      <div class="border border-base rounded-md p-4 text-center text-sm">
        <LoginForm />
      </div>
    </div>
  </main>
</template>
