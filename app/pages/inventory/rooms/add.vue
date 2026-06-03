<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <PageTitle
      title="Add room"
      description="Register a new room in the inventory."
    />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <NCard
        title="Create inventory room"
        description="Fill in the room details below. Required fields are validated before submission."
        card="outline-gray"
        class="lg:col-span-2"
        :una="{
          cardTitle: 'text-center scroll-m-20 font-semibold text-primary-700 dark:text-primary-400 text-lg lg:text-xl',
          cardContent: 'space-y-4',
          cardDescription: 'text-muted'
        }"
      >
        <FormInventoryRoomAdd />
      </NCard>

      <NCard
        card="soft-gray"
        class="lg:col-span-1"
      >
        <div class="space-y-3 text-sm">
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-info"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Before you add
            </span>
          </div>
          <p class="text-muted">
            Room slug is generated automatically from building, floor, and room number.
          </p>
          <p class="text-muted">
            Building is limited to Alfa, Beta, Gamma, and Delta. Room number and floor are required.
          </p>
        </div>
      </NCard>
    </div>
  </div>
</template>
