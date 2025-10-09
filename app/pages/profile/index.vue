<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    Logged in!
    <DialogBarcodeReader
      type="LiveStream"
      :readerTypes="['code_128_reader', 'code_39_reader', 'code_93_reader', 'codabar_reader']"
    />
    <DialogZxingReader />
  </main>
</template>
