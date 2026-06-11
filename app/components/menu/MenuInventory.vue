<script setup lang="ts">
const data = {
  menuItems: [
    {
      title: 'Rooms',
      url: '#',
      icon: 'i-lucide-building-2',
      isActive: true,
      items: [
        {
          title: 'Overview',
          url: '/inventory/rooms'
        },
        {
          title: 'Add room',
          url: '/inventory/rooms/add'
        }
      ]
    },
    {
      title: 'Equipment',
      url: '#',
      icon: 'i-lucide-refrigerator',
      isActive: true,
      items: [
        {
          title: 'Overview',
          url: '/inventory/equipment'
        },
        {
          title: 'Add equipment',
          url: '/inventory/equipment/add'
        }
      ]
    },
    {
      title: 'Containers',
      url: '#',
      icon: 'i-lucide-box',
      items: [
        {
          title: 'Overview',
          url: '/inventory/containers'
        }
      ]
    },
    {
      title: 'Items',
      url: '#',
      icon: 'i-lucide-test-tubes',
      items: [
        {
          title: 'Overview',
          url: '/inventory/items'
        }
      ]
    }
  ],
  worksets: [
    {
      name: 'P.Ositive_25_01',
      url: '#',
      icon: 'i-lucide-group'
    },
    {
      name: 'P.Ositive_24_01',
      url: '#',
      icon: 'i-lucide-group'
    },
    {
      name: 'N.Egative_25_01',
      url: '#',
      icon: 'i-lucide-group'
    }
  ]
}
</script>

<template>
  <NavigationGroups
    title="Pages"
    :items="data.menuItems"
  />
  <NavigationWorksets
    title="Your Worksets"
    :worksets="data.worksets"
  />
</template>
