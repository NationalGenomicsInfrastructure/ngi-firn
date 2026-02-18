<script setup lang="ts">
const data = {
  navMain: [
    {
      title: 'Cold Storage Inventory',
      url: '/inventory',
      icon: 'i-lucide-snowflake',
      isActive: false
    },
    {
      title: 'Projects information',
      url: '/projects',
      icon: 'i-lucide-dna',
      isActive: false
    }
  ]
}

const route = useRoute()
const activeMenu = computed(() => {
  const paths = route.path.split('/').filter(Boolean)
  const firstLevelNav = paths[0] || ''
  return firstLevelNav
})

const activeTitle = computed(() => {
  const title = data.navMain.find(item => item.url === activeMenu.value)?.title || activeMenu.value || ''
  return title.charAt(0).toUpperCase() + title.slice(1)
})

const { setOpen } = useSidebar()
</script>

<template>
  <NSidebar
    class="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row"
    collapsible="icon"
  >
    <!-- This is the first sidebar -->
    <!-- We disable collapsible and adjust width to icon. -->
    <!-- This will make the sidebar appear as icons. -->
    <NSidebar
      collapsible="none"
      class="text-left bg-primary-700 dark:bg-primary-900 border-r-3 border-primary-100 dark:border-primary-400 text-primary-700 dark:text-primary-400 !w-[calc(var(--sidebar-width-icon)_+_1px)]"
    >
      <NSidebarHeader />
      <NSidebarContent>
        <NSidebarGroup>
          <NSidebarGroupContent class="px-1.5 md:px-0">
            <NSidebarMenu>
              <NSidebarMenuItem
                v-for="item in data.navMain"
                :key="item.title"
              >
                <NSidebarMenuButton
                  :tooltip="h('div', { hidden: false }, item.title)"
                  class="soft hover:text-primary-500/50 focus:outline-primary-50 dark:focus:outline-primary-500 active:outline-primary text-primary-50 dark:text-primary-400"
                  style="background-color: transparent;"
                  @click="() => {
                    setOpen(true)
                    navigateTo(item.url)
                  }"
                >
                  <NIcon :name="item.icon" />
                  <span>{{ item.title }}</span>
                </NSidebarMenuButton>
              </NSidebarMenuItem>
            </NSidebarMenu>
          </NSidebarGroupContent>
        </NSidebarGroup>
      </NSidebarContent>
      <LazyNavigationSidebarFooter />
    </NSidebar>
    <!--  This is the second sidebar -->
    <!--  We disable collapsible and let it fill remaining space -->
    <NSidebar
      collapsible="none"
      class="hidden flex-1 md:flex border-r-2 border-primary/20 dark:border-primary-700 bg-primary-50 dark:bg-primary/25"
      sheet="left"
      rail
    >
      <NSidebarHeader>
        <LogoFirn class="h-8 w-auto mb-0" />
        <h4 class="text-primary/60 text-sm capitalize text-center">
          {{ activeTitle }}
        </h4>
      </NSidebarHeader>
      <!-- This is the slot for the page-specific main navigation -->
      <slot name="sidebar-main-navigation" />
      <LazyMenuAdministration v-if="activeMenu === 'administration'" />
      <LazyMenuInventory v-if="activeMenu === 'inventory'" />
      <LazyMenuSettings v-if="activeMenu === 'settings'" />
    </NSidebar>
  </NSidebar>
</template>
