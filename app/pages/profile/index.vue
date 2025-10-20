<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6 flex flex-col gap-4">
    Logged in!
    <DialogBarcodeReader
      type="LiveStream"
      :reader-types="['code_128_reader']"
    />
    <DialogZxingReader />
  </main>
</template>
