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
    to: `/${paths.slice(0, index + 1).join('/')}`
  }))
})
</script>

<template>
  <NSidebarProvider>
    <NavigationSidebarMain />
    <NToaster />

    <NSidebarInset>
      <header class="h-12 flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-end shrink-0 items-center gap-2 dark:bg-primary/5 border-b-2 border-primary/20 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar_wrapper:h-12">
        <div class="flex items-center gap-2 px-4">
          <NBreadcrumb
            breadcrumb-active="prose"
            class="hidden lg:flex text-sm"
            separator="i-lucide-slash"
            :items="breadcrumbItems"
          />
          <NSeparator
            orientation="vertical"
            icon
            class="mx-0 mr-2 h-4"
          />
          <LogoSciLifeLab class="ml-4 mr-2 h-8 w-auto" />
        </div>
      </header>
      <div class="container mx-auto py-6 px-4 md:px-6 lg:px-8 h-full dark:bg-primary/5">
        <main>
            <slot />
        </main>
      </div>
    </NSidebarInset>
  </NSidebarProvider>
</template>
