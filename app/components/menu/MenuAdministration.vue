<script setup lang="ts">

const data = {
  menuItems: [
    {
      title: 'Users',
      url: '#',
      icon: 'i-lucide-users',
      items: [
        {
          title: 'List Users',
          url: '/administration/users/list',
        },
        {
          title: 'Add User',
          url: '/administration/users/add',
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
          url: '/administration/logs/event',
        },
        {
          title: 'User Logs',
          url: '/administration/logs/user',
        },
      ],
    },
  ],
}
</script>

<template>
  <NavigationGroups title="Manage Firn" :items="data.menuItems" />
</template>
