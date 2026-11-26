<script setup lang="ts">
const data = {
  menuItems: [
    {
      title: 'Lab tasks',
      url: '#',
      icon: 'i-lucide-clipboard-list',
      isActive: true,
      items: [
        {
          title: 'Create new',
          url: '/tasks/create'
        },
        {
          title: 'Display unclaimed',
          url: '/tasks/unclaimed'
        },
        {
          title: 'View your own',
          url: '/tasks/own'
        }
      ]
    }
  ]
}
</script>

<template>
  <NavigationGroups
    title="Pages"
    :items="data.menuItems"
  />
</template>
