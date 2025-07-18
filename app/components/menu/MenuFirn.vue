<script setup lang="ts">

const data = {
  menuItems: [
    {
      title: 'Projects',
      url: '#',
      icon: 'i-lucide-square-terminal',
      isActive: true,
      items: [
        {
          title: 'List Projects',
          url: '#',
        },
        {
          title: 'Manage Projects',
          url: '#',
        },
      ],
    },
    {
      title: 'Plates',
      url: '#',
      icon: 'i-lucide-bot',
      items: [
        {
          title: 'List Plates',
          url: '#',
        },
        {
          title: 'Search Plates',
          url: '#',
        },
        {
          title: 'Manage Plates',
          url: '#',
        },
      ],
    },
    {
      title: 'Freezers',
      url: '#',
      icon: 'i-lucide-thermometer-snowflake',
      items: [
        {
          title: 'List Freezers',
          url: '#',
        },
        {
          title: 'Manage Freezers',
          url: '#',
        },
        {
          title: 'Configure Racks',
          url: '#',
        },
        {
          title: 'Freezer Status',
          url: '#',
        },
      ],
    },
    {
      title: 'Documentation',
      url: '#',
      icon: 'i-lucide-book-open',
      items: [
        {
          title: 'Introduction',
          url: '#',
        },
        {
          title: 'Tutorial',
          url: '#',
        },
        {
          title: 'FAQ',
          url: '#',
        },
      ],
    },
  ],
  worksets: [
    {
      name: 'P.Ositive_25_01',
      url: '#',
      icon: 'i-lucide-group',
    },
    {
      name: 'P.Ositive_24_01',
      url: '#',
      icon: 'i-lucide-group',
    },
    {
      name: 'N.Egative_25_01	',
      url: '#',
      icon: 'i-lucide-group',
    },
  ],
}
</script>

<template>
  <NSidebarHeader>
    <LogoFirn class="h-8 w-auto" />
  </NSidebarHeader>
  <NavigationGroups title="Actions" :items="data.menuItems" />
  <NavigationWorksets title="Your Worksets" :worksets="data.worksets" />
</template>
