<script setup lang="ts">
const { clear, user: sessionUser } = useUserSession()

const user = computed(() => {
  return {
    name: sessionUser.value?.name || '',
    subtitle: sessionUser.value?.provider || '',
    avatar: sessionUser.value?.avatar || ''
  }
})

const navs = [
  {
    label: 'Profile',
    leading: 'i-lucide-user',
    onClick: () => {
      navigateTo('/settings/profile')
    }
  },
  {
    label: 'Settings',
    leading: 'i-lucide-settings',
    onClick: () => {
      navigateTo('/settings')
    }
  },
  {
    label: 'Tokens',
    leading: 'i-lucide-key-round',
    onClick: () => {
      navigateTo('/settings/tokens')
    }
  },
  {
    label: 'Log out',
    leading: 'i-lucide-log-out',
    onClick: () => {
      clear()
      navigateTo('/')
    }
  }
]

const { isMobile } = useSidebar()
</script>

<template>
  <NSidebarMenu>
    <NSidebarMenuItem>
      <NDropdownMenu
        :items="navs"
        :_dropdown-menu-content="{
          class: 'min-w-56',
          align: 'start',
          side: isMobile ? 'bottom' : 'right',
          sideOffset: 4
        }"
        :_dropdown-menu-label="{
          class: 'p-0 font-normal'
        }"
      >
        <NSidebarMenuButton
          class="min-h-14 h-14 max-h-14 w-8 min-w-8 max-w-8 !grid !grid-cols-1 place-items-center border-2 border-primary-100 dark:border-primary-400 text-primary-50 dark:text-primary-400"
        >
          <div class="flex flex-col items-center justify-center gap-1">
            <NIcon
              name="i-lucide-user"
              class="size-4"
            />
            <NIcon
              name="i-lucide-power"
              class="size-4"
            />
          </div>
        </NSidebarMenuButton>

        <template #menu-label>
          <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <NAvatar
              square="12"
              rounded="lg"
              :src="user.avatar"
              :alt="user.name"
            />
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-semibold">{{ user.name }}</span>
              <span class="truncate text-xs capitalize">{{ user.subtitle }}</span>
            </div>
          </div>
        </template>
      </NDropdownMenu>
    </NSidebarMenuItem>
  </NSidebarMenu>
</template>

<style>
.dropdown-menu-content {
    background-color: var(--c-background);
}
</style>
