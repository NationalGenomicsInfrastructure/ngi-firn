<template>
  <div class="container mx-auto px-4 md:px-6 lg:px-8">
    <NToaster />
    <FrontpageHeader />
    
    <main>
      <slot />
    </main>

    <LazyFrontpageFooter />
  </div>
</template>
