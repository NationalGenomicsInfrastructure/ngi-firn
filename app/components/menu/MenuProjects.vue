<script setup lang="ts">
const data = {
  menuItems: [
    {
      title: 'Projects',
      url: '#',
      icon: 'i-lucide-dna',
      isActive: true,
      items: [
        {
          title: 'Find projects',
          url: '/projects'
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
  <NavigationProjectBookmarks title="Your bookmarked projects" />
</template>
