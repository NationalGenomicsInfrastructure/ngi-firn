<script setup lang="ts">
const { loggedIn } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
}, { immediate: true })

const route = useRoute()
const breadcrumbItems = computed(() => {
  const paths = route.path.split('/').filter(Boolean)
  return paths.map((path, index) => ({
    label: path.charAt(0).toUpperCase() + path.slice(1),
    to: `/${paths.slice(0, index + 1).join('/')}`,
  }))
})
</script>

<template>
  <NSidebarProvider>
    <NavigationSidebarMain />
    <NToaster />

    <NSidebarInset>
      <header class="h-12 flex shrink-0 items-center gap-2 border-b border-primary/20 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar_wrapper:h-12">
        <LogoFirn class="ml-4 mr-2 h-8 w-auto" />
        <NSeparator orientation="vertical" icon class="mx-0 mr-2 h-4" />
        <div class="flex items-center gap-2 px-4">
          <NBreadcrumb
            breadcrumb-active="text-secondary"
            class="hidden lg:flex text-sm"
            separator="i-lucide-slash"
            :items="breadcrumbItems"
          />
        </div>
      </header>
      <div class="flex items-center gap-2 px-4">
        <main>
          <slot />
        </main>
      </div>
    </NSidebarInset>
  </NSidebarProvider>
</template>
