<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Storage Inventory"
      description="Manage rooms and storage equipment."
    />

    <CardInventorySummary />

    <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <NCard
        title="Manage Rooms"
        description="Rooms are the top-level physical storage locations. Each storage equipment must be assigned to a room."
        card="outline-gray"
      >
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NButton
            label="List rooms"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-building-2"
            to="/inventory/rooms"
          />
          <NButton
            label="Register room"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-house-plus"
            to="/inventory/rooms/add"
          />
        </div>
      </NCard>

      <NCard
        title="Handle equipment"
        description="Fridges, freezers, cabinets and such are storage equipment. Storage equipment can hold both, containers and items."
        card="outline-gray"
      >
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NButton
            label="Open equipment"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-shelving-unit"
            to="/inventory/equipment"
          />
          <NButton
            label="Create equipment"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-between-horizontal-end"
            to="/inventory/equipment/add"
          />
        </div>
      </NCard>

      <NCard
        title="Track containers"
        description="See a list of all registered containers. Containers are physical storage units that can hold items or other containers, while giving structure to our storage equipment and helping to organize the inventory."
        card="outline-gray"
      >
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NButton
            label="Browse containers"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-package-search"
            to="/inventory/containers"
          />
          <NButton
            label="Create container"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-package-plus"
            to="/inventory/containers/add"
          />
        </div>
      </NCard>

      <NCard
        title="Trace items"
        description="An item is the atomic unit of our inventory. It comprises objects such as single tubes, vials or plates. Within reason, an item cannot be physically divided into smaller units."
        card="outline-gray"
      >
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NButton
            label="Locate items"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-test-tubes"
            to="/inventory/items"
          />
          <NButton
            label="Initialize item"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-picture-in-picture"
            to="/inventory/items/add"
          />
        </div>
      </NCard>
    </div>
  </main>
</template>
