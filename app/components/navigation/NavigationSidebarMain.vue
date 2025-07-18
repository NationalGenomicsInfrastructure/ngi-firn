<script setup lang="ts">
const data = {
  navMain: [
    {
      title: 'NGI Firn',
      url: '#',
      icon: 'i-lucide-snowflake',
      isActive: true
    },
    {
      title: 'Genomics Status',
      url: '#',
      icon: 'i-lucide-dna',
      isActive: false
    },
    {
      title: 'Notebook',
      url: '#',
      icon: 'i-lucide-notebook-pen',
      isActive: false
    }
  ]
}
const activeItem = ref(data.navMain[0] || { title: '', url: '', icon: '', isActive: false })
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
      class="border-r !w-[calc(var(--sidebar-width-icon)_+_1px)]"
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
                  :is-active="activeItem.title === item.title"
                  class="px-2.5 md:px-2"
                  @click="() => {
                    activeItem = item
                    setOpen(true)
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
      <NSidebarFooter>
        <NSidebarMenu>
          <NSidebarMenuItem>
            <ColorsChoice />
          </NSidebarMenuItem>
          <NSidebarMenuItem>
            <NThemeSwitcher />
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
        <!-- This is the slot for the page-specific main navigation -->
        <slot name="sidebar-main-navigation" />
    </NSidebar>
  </NSidebar>
</template>
