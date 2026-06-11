<script setup lang="ts">
definePageMeta({
  layout: 'private'
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Containers"
      description="Browse and manage storage containers in the inventory."
    />

    <NAlert
      alert="border-info"
      title="Containers are managed within parents"
      description="Containers belong to storage equipment or other containers. Browse equipment to view, add, or manage containers within them."
      icon="i-lucide-info"
      class="mt-6"
    >
      <div class="mt-4">
        <NButton
          label="Browse equipment"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-box"
          to="/inventory/equipment"
          size="sm"
        />
      </div>
    </NAlert>

    <div class="mt-6">
      <NCard
        title="Quick start"
        description="Get started with containers"
        card="soft-gray"
      >
        <ul class="space-y-3 text-sm">
          <li class="flex items-start gap-3">
            <NIcon
              name="i-lucide-circle-check"
              class="text-success-500 dark:text-success-400 mt-0.5 shrink-0"
            />
            <span>
              <strong>Add a container:</strong> Navigate to a storage equipment detail page and click "Add container" to create a new container within that equipment.
            </span>
          </li>
          <li class="flex items-start gap-3">
            <NIcon
              name="i-lucide-circle-check"
              class="text-success-500 dark:text-success-400 mt-0.5 shrink-0"
            />
            <span>
              <strong>View container details:</strong> Click on a container card to view its properties, child containers, and stored items.
            </span>
          </li>
          <li class="flex items-start gap-3">
            <NIcon
              name="i-lucide-circle-check"
              class="text-success-500 dark:text-success-400 mt-0.5 shrink-0"
            />
            <span>
              <strong>Nest containers:</strong> Containers can hold other containers, enabling complex storage hierarchies.
            </span>
          </li>
          <li class="flex items-start gap-3">
            <NIcon
              name="i-lucide-circle-check"
              class="text-success-500 dark:text-success-400 mt-0.5 shrink-0"
            />
            <span>
              <strong>Add items:</strong> From a container's detail page, add inventory items to track samples, reagents, or other lab materials.
            </span>
          </li>
        </ul>
      </NCard>
    </div>
  </main>
</template>
