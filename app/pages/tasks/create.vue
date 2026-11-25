<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Create a new task"
      description="Specify the plan and assign the people involved."
    />
    <StepperTaskCreate />
  </main>
</template>
