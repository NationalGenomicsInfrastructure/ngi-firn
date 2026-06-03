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
        title="Enter room details"
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
        class="lg:col-span-1"
      >
        <div class="space-y-3 text-sm">
          <div class="flex items-center gap-1.5 mt-4 mb-0.5">
            <NIcon
              name="i-lucide-info"
              class="text-primary-400 dark:text-primary-600 text-sm"
            />
            <span class="text-sm uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Before you add
            </span>
          </div>
          <p class="text-muted">
            Please <NLink
              href="/inventory/rooms"
              class="text-primary-400 dark:text-primary-600 hover:underline"
            >
              check
            </NLink> that the room does not already exist in the inventory under a different name or identifier.
          </p>
          <p class="text-muted">
            The room identifier is generated automatically from building, floor, and room number. It is used in URLs
            to link to the room's details and access its contents.
          </p>
        </div>
      </NCard>
    </div>
  </div>
</template>
