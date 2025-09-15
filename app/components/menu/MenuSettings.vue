<script setup lang="ts">
const data = {
  menuItems: [
    {
      title: 'Your user account',
      url: '#',
      icon: 'i-lucide-user',
      items: [
        {
          title: 'Profile',
          url: '/settings/profile'
        },
        {
          title: 'Tokens',
          url: '/settings/tokens'
        }
      ]
    }
  ]
}
</script>

<template>
  <NavigationGroups
    title="Customize Firn"
    :items="data.menuItems"
  />
</template>
