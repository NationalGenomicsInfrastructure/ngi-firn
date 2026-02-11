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
    },
    {
      title: 'Appearance',
      url: '#',
      icon: 'i-lucide-paintbrush',
      items: [
        {
          title: 'Theme',
          url: '/settings'
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
