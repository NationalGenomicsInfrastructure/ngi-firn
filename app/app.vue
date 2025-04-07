<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'

const { loggedIn, user, clear } = useUserSession()
const colorMode = useColorMode()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
})

const isDarkMode = computed({
  get: () => colorMode.preference === 'dark',
  set: () =>
    (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark')
})

useHead({
  htmlAttrs: { lang: 'en' },
  link: [{ rel: 'icon', href: '/icon.png' }]
})

useSeoMeta({
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  title: 'NGI Noetic',
  description:
    'Cold storage data and more',
})

const items = [
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      onSelect: clear
    }
  ]
] satisfies DropdownMenuItem[][]
</script>

<template>
  <UApp>
    <UContainer class="min-h-screen flex flex-col my-4">
      <div class="mb-2 text-right">
        <UButton
          square
          variant="ghost"
          color="neutral"
          :icon="
            $colorMode.preference === 'dark' || $colorMode.preference === 'system'
              ? 'i-lucide-moon'
              : 'i-lucide-sun'
          "
          @click="isDarkMode = !isDarkMode"
        />
      </div>

      <UCard variant="subtle">
        <template #header>
          <h3 class="text-lg font-semibold leading-6">
            <NuxtLink to="/">
              Noetic
            </NuxtLink>
          </h3>
          <div
            v-if="!loggedIn"
            class="flex flex-wrap -mx-2 sm:mx-0"
          >
          <UButton
            to="/api/auth/github"
            icon="i-simple-icons-github"
            label="Login with GitHub"
            color="neutral"
            size="xs"
            class="mx-2"
            external
          />
          <UButton
            to="/api/auth/google"
            icon="i-simple-icons-google"
            label="Login with Google"
            color="neutral"
            size="xs"
            class="mx-2"
            external
          />
          </div>
          <div
            v-else
            class="flex flex-wrap -mx-2 sm:mx-0"
          >
            <UButton
              to="/todos"
              icon="i-lucide-list"
              label="Todos"
              :color="$route.path === '/todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <!--
            <UButton
              to="/optimistic-todos"
              icon="i-lucide-sparkles"
              label="Optimistic Todos"
              :color="$route.path === '/optimistic-todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            -->
            <UDropdownMenu
              v-if="user"
              :items="items"
            >
              <UButton
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-chevron-down"
              >
                <UAvatar
                  :src="`${user.avatar}`"
                  :alt="user.name"
                  size="3xs"
                />
                {{ user.name }}
              </UButton>
            </UDropdownMenu>
          </div>
        </template>
        <NuxtPage />
      </UCard>

      <footer class="text-center mt-2">
        <NuxtLink
          href="https://ngisweden.scilifelab.se"
          target="_blank"
          class="text-sm text-neutral-500 hover:text-neutral-700"
        >
          NGI Sweden
        </NuxtLink>
        ·
        <NuxtLink
          href="https://github.com/NationalGenomicsInfrastructure/"
          target="_blank"
          class="text-sm text-neutral-500 hover:text-neutral-700"
        >
          NGI GitHub
        </NuxtLink>
      </footer>
    </UContainer>
  </UApp>
</template>

<style lang="postcss">
body {
  @apply font-sans text-neutral-950 bg-neutral-50 dark:bg-neutral-950 dark:text-neutral-50;
}
</style>
