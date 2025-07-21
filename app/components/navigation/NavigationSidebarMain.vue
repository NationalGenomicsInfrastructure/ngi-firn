<script setup lang="ts">
const data = {
  navMain: [
    {
      title: 'Cold Storage Inventory',
      url: 'inventory',
      icon: 'i-lucide-snowflake',
      isActive: true
    },
    {
      title: 'Genomics Status',
      url: '#',
      icon: 'i-lucide-dna',
      isActive: false
    },
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

const { setOpen, toggleSidebar } = useSidebar()
</script>

<template>
  <NSidebar
    class="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row border-r border-primary/20"
    collapsible="icon"
  >
    <!-- This is the first sidebar -->
    <!-- We disable collapsible and adjust width to icon. -->
    <!-- This will make the sidebar appear as icons. -->
    <NSidebar
      collapsible="none"
      class="bg-primary/5 border-r !w-[calc(var(--sidebar-width-icon)_+_1px)]"
    >
      <NSidebarHeader>
        <NSidebarMenu>
          <NSidebarMenuItem>
            <NSidebarMenuButton
              size="lg"
              as-child
              class="md:h-8 md:p-0"
            >
              <NLink
                to="#"
                @click="toggleSidebar()"
              >
                <LogoNGI class="w-full h-full" />
              </NLink>
            </NSidebarMenuButton>
          </NSidebarMenuItem>
        </NSidebarMenu>
      </NSidebarHeader>
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
                  class="soft hover:bg-primary/7 focus:outline-primary active:outline-primary text-color-primary"
                  style="background-color: transparent;"
                  @click="() => {
                    setOpen(true)
                    navigateTo(item.url)
                  }"
                >
                  <NIcon :name="item.icon"/>
                  <span>{{ item.title }}</span>
                </NSidebarMenuButton>
              </NSidebarMenuItem>
            </NSidebarMenu>
          </NSidebarGroupContent>
        </NSidebarGroup>
      </NSidebarContent>
      <NSidebarFooter>
        <NSidebarMenu>
          <NSidebarMenuItem>
            <ColorsChoice />
          </NSidebarMenuItem>
            <NSidebarMenuItem>
              <NThemeSwitcher />
            </NSidebarMenuItem>
            <NSidebarMenuItem>
              <AdministrationButton />
            </NSidebarMenuItem>
        </NSidebarMenu>
        <NavigationUser />
      </NSidebarFooter>
    </NSidebar>
    <!--  This is the second sidebar -->
    <!--  We disable collapsible and let it fill remaining space -->
    <NSidebar
      collapsible="none"
      class="hidden flex-1 md:flex"
      sheet="left"
      rail
    >  
      <NSidebarHeader>
        <LogoFirn class="h-8 w-auto mb-0" />
        <h4 class="text-primary/60 text-sm capitalize text-center">{{ activeTitle }}</h4>
      </NSidebarHeader>
      <!-- This is the slot for the page-specific main navigation -->
      <slot name="sidebar-main-navigation" />
      <MenuInventory v-if="activeMenu === 'inventory'" />
    </NSidebar>
  </NSidebar>
</template>
