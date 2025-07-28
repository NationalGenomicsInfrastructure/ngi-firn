<script setup lang="ts">

const data = {
  menuItems: [
    {
      title: 'Users',
      url: '#',
      icon: 'i-lucide-user-cog',
      items: [
        {
          title: 'List Users',
          url: '#',
        },
        {
          title: 'Add User',
          url: '#',
        },
      ],
    },
    {
      title: 'Review Logs',
      url: '#',
      icon: 'i-lucide-history',
      items: [
        {
          title: 'Event Logs',
          url: '#',
        },
        {
          title: 'User Logs',
          url: '#',
        },
      ],
    },
  ],
}
</script>

<template>
  <NavigationGroups title="Manage Firn" :items="data.menuItems" />
</template>
