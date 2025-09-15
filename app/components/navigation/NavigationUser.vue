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
      navigateTo('/profile')
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
          class: 'min-w-56 w-[--reka-dropdown-menu-trigger-width] rounded-lg',
          align: 'start',
          side: isMobile ? 'bottom' : 'right',
          sideOffset: 4
        }"
        :_dropdown-menu-label="{
          class: 'p-0 font-normal'
        }"
      >
        <NSidebarMenuButton
          size="lg"
          class="md:h-8 data-[state=open]:bg-sidebar-accent md:p-0 data-[state=open]:text-sidebar-accent-foreground"
        >
          <NAvatar
            square="8"
            rounded="lg"
            :src="user.avatar"
            :alt="user.name"
          />
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-semibold">{{ user.name }}</span>
            <span class="truncate text-xs capitalize">{{ user.subtitle }}</span>
          </div>
          <NIcon
            name="i-lucide-chevron-down"
            class="ml-auto size-4"
          />
        </NSidebarMenuButton>

        <template #menu-label>
          <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <NAvatar
              square="8"
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
