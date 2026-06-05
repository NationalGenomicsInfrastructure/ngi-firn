<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Cold Storage Inventory"
      description="Manage rooms and storage equipment."
    />

    <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <NCard
        title="Rooms"
        description="Browse all registered rooms."
        card="outline-gray"
      >
        <NButton
          label="Open rooms"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-building-2"
          to="/inventory/rooms"
        />
      </NCard>

      <NCard
        title="Add room"
        description="Register a new room in the inventory."
        card="outline-gray"
      >
        <NButton
          label="Create room"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-plus"
          to="/inventory/rooms/add"
        />
      </NCard>
    </div>
  </main>
</template>
