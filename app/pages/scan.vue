<script setup lang="ts">
const { loggedIn } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
}, { immediate: true })

const tabs = ref([
  {
    value: 'info',
    name: 'Info',
  },
  {
    value: 'actions',
    name: 'Actions',
  },
  {
    value: 'plans',
    name: 'Plans',
  },
])
</script>

<template>
  <div class="container mx-auto px-4 md:px-6 lg:px-8 h-full">
    <NToaster />
      <LogoFirn class="h-16 w-auto mt-2 mb-0 mx-auto" />
      <h4 class="text-primary-700 dark:text-muted text-md capitalize text-center mb-12">
        Barcode-Scanner
      </h4>

    <NTabs
    :items="tabs"
    default-value="info"
    :_tabs-list="{
      class: 'grid grid-cols-3 w-full border-b border-primary bg-primary-50 dark:bg-primary/10'
    }"
    :_tabs-content="{
      class: 'py-12 mx-auto w-full'
    }"
  >
    <template #content="{ item }">
      <div v-if="item.value === 'info'">
        <br />
      </div>
      <div v-if="item.value === 'actions'">
        <br />
      </div>
      <div v-if="item.value === 'plans'">
        <br />
      </div>
    </template>
  </NTabs>

  </div>
</template>