<script setup lang="ts">
const { toggleSidebar, setOpen, state: sidebarState } = useSidebar()
const colorMode = useColorMode()
const { user } = useUserSession()

type NavFooterItem = {
  title: string
  icon: string
  iconAlt?: string
  onClick: () => void
  visible?: () => boolean
}

const data: { navFooter: NavFooterItem[] } = {
  navFooter: [
    {
      title: 'Open Sidebar',
      icon: 'i-lucide-panel-left-open',
      iconAlt: 'i-lucide-panel-left-close',
      onClick: () => toggleSidebar()
    },
    {
      title: 'Toggle theme',
      icon: 'i-radix-icons-moon',
      iconAlt: 'i-radix-icons-sun',
      onClick: () => {
        colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
      }
    },
    {
      title: 'Administration',
      icon: 'i-lucide-key-round',
      onClick: () => {
        setOpen(true)
        navigateTo('/administration')
      },
      visible: () => !!user?.value?.isAdminClientside
    }
  ]
}

const visibleNavFooter = computed(() =>
  data.navFooter.filter(item => item.visible === undefined || item.visible())
)

function iconFor(item: NavFooterItem) {
  if (item.icon === 'i-radix-icons-moon' && item.iconAlt && colorMode.preference === 'dark') return item.iconAlt
  if (item.icon === 'i-lucide-panel-left-open' && sidebarState.value === 'expanded' && item.iconAlt) return item.iconAlt
  return item.icon
}

const actionButtonClass
  = 'soft hover:text-primary-500/50 text-primary-50 dark:text-primary-400'
const actionButtonStyle = 'background-color: transparent;'
</script>

<template>
  <NSidebarFooter>
    <NSidebarMenu>
      <NSidebarMenuItem
        v-for="item in visibleNavFooter"
        :key="item.title"
      >
        <NSidebarMenuButton
          :tooltip="h('div', { hidden: false }, item.title)"
          :class="actionButtonClass"
          :style="actionButtonStyle"
          @click="item.onClick"
        >
          <NIcon :name="iconFor(item)" />
          <span class="hidden md:block">{{ item.title }}</span>
        </NSidebarMenuButton>
      </NSidebarMenuItem>
    </NSidebarMenu>
    <NavigationUser />
  </NSidebarFooter>
</template>
