<script setup lang="ts">
// This is sample data
const data = {
  user: {
    name: 'Brilliant Researcher',
    email: 'brilliant.researcher@scilifelab.se',
    avatar: ''
  },
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
const activeItem = ref(data.navMain[0])
const { setOpen, toggleSidebar } = useSidebar()
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
        <NavigationUser :user="data.user" />
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
      <NSidebarHeader class="gap-3.5 border-b p-4">
        <div class="w-full flex items-center justify-between">
        </br>
        </div>
        <NSidebarInput placeholder="Type to search..." />
      </NSidebarHeader>
    </NSidebar>
  </NSidebar>
</template>
