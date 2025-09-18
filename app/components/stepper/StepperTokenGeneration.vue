<script setup lang="ts">
const items = [
  {
    title: 'Configure token',
    description: 'Configure the settings for the new token',
  },
  {
    title: 'Generate token',
    description: 'Generate the new token',
  },
  {
    title: 'Save token',
    description: 'Save the new token in a safe place',
  },
]

const stepper = useTemplateRef('tokenStepper')
</script>

<template>
  <NStepper ref="tokenStepper" :items="items">
    <template #content="{ item }">
      <NAspectRatio
        :ratio="16 / 4"
        class="mx-auto max-w-2xl"
      >
        <div class="h-full flex flex-col items-center justify-center p-2 sm:p-4">
          <p>{{ item.title }}</p>
        </div>
      </NAspectRatio>
    </template>
  </NStepper>
  <div class="mx-auto mt-4 max-w-2xl flex justify-between gap-2">
    <NButton label="prev" leading="i-lucide-arrow-left" @click="stepper?.prevStep()" />
    <NButton label="next" trailing="i-lucide-arrow-right" @click="stepper?.nextStep()" />
  </div>
</template>
