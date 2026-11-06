<script setup lang="ts">
const { toggleSidebar, setOpen, state: sidebarState } = useSidebar()
const colorMode = useColorMode()
const { user } = useUserSession()

type NavFooterItem = {
  key: string
  title: string
  tooltip: string
  icon: string
  onClick: () => void
  visible?: boolean
}

const isExpanded = computed(() => sidebarState.value === 'expanded')
// `value` is the resolved theme; `preference` may be 'system'.
const isDark = computed(() => colorMode.value === 'dark')

const navFooter = computed<NavFooterItem[]>(() => [
  {
    key: 'sidebar',
    title: isExpanded.value ? 'Close sidebar' : 'Open sidebar',
    tooltip: isExpanded.value ? 'Collapse the menu to icons only' : 'Show the full menu',
    icon: isExpanded.value ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open',
    onClick: () => toggleSidebar()
  },
  {
    key: 'theme',
    title: isDark.value ? 'Light mode' : 'Dark mode',
    tooltip: `Switch to the ${isDark.value ? 'light' : 'dark'} theme`,
    icon: isDark.value ? 'i-radix-icons-sun' : 'i-radix-icons-moon',
    onClick: () => {
      colorMode.preference = isDark.value ? 'light' : 'dark'
    }
  },
  {
    key: 'administration',
    title: 'Administration',
    tooltip: 'Manage users and system settings',
    icon: 'i-tabler-brand-angular-filled',
    onClick: () => {
      setOpen(true)
      navigateTo('/administration')
    },
    visible: !!user.value?.isAdminClientside
  }
])

const visibleNavFooter = computed(() => navFooter.value.filter(item => item.visible !== false))

const actionButtonClass
  = 'soft hover:text-primary-500/50 text-primary-50 dark:text-primary-400'
const actionButtonStyle = 'background-color: transparent;'
</script>

<template>
  <NSidebarFooter>
    <NSidebarMenu>
      <NSidebarMenuItem
        v-for="item in visibleNavFooter"
        :key="item.key"
      >
        <NTooltip :_tooltip-content="{ side: 'right', align: 'center' }">
          <NSidebarMenuButton
            :class="actionButtonClass"
            :style="actionButtonStyle"
            @click="item.onClick"
          >
            <NIcon :name="item.icon" />
            <span class="hidden md:block">{{ item.title }}</span>
          </NSidebarMenuButton>
          <template #content>
            <NavigationTooltip
              :title="item.title"
              :tooltip="item.tooltip"
              :icon="item.icon"
            />
          </template>
        </NTooltip>
      </NSidebarMenuItem>
    </NSidebarMenu>
    <NavigationUser />
  </NSidebarFooter>
</template>
