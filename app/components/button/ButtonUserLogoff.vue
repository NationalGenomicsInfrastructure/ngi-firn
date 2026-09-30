<script setup lang="ts">
const { clear, user: sessionUser } = useUserSession()

const user = computed(() => {
  return {
    name: sessionUser.value?.name || '',
    subtitle: sessionUser.value?.provider || '',
    avatar: sessionUser.value?.avatar || ''
  }
})
</script>

<template>
  <NButton
    btn="outline-primary hover:outline-error"
    class="rounded-full"
    label="Logout"
    trailing="i-lucide-power"
    @click="clear(); navigateTo('/')"
  >
    <template #leading>
      <NAvatar
        :key="`avatar-${user.name}`"
        :src="user.avatar"
        :alt="user.name"
        square="7"
        avatar="solid-primary"
      >
        <template #fallback>
          <span class="inline-flex items-center gap-0 leading-none text-primary-200 dark:text-primary-100 font-extrabold"><NIcon
            name="i-lucide-snowflake"
            class="w-4 h-4"
          />F</span>
        </template>
      </NAvatar>
    </template>
  </NButton>
</template>
