<template>
  <NSidebarProvider>
    <NavigationSidebarMain />

    <main>
      <NSidebarTrigger />
      <slot />
    </main>

  </NSidebarProvider>
</template>
