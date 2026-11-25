<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'
import { displayUserName } from '~/utils/users/display'

/*
 * Avatar of a Firn user: the Google avatar, followed by the GitHub avatar when the account is
 * linked. Without a Google avatar a snowflake "F" is shown instead.
 */
const props = withDefaults(defineProps<{
  user: DisplayUserToUsers
  size?: string
  github?: boolean
}>(), {
  size: '7',
  github: true
})

const name = computed(() => displayUserName(props.user))
</script>

<template>
  <NAvatarGroup :max="2">
    <NAvatar
      :key="`avatar-google-${user.firnId}`"
      :src="user.googleAvatar ?? undefined"
      :alt="name"
      :square="size"
      avatar="solid-primary"
    >
      <template #fallback>
        <span class="inline-flex items-center gap-0 leading-none text-primary-200 dark:text-primary-100 font-extrabold">
          <NIcon
            name="i-lucide-snowflake"
            class="w-4 h-4"
          />F
        </span>
      </template>
    </NAvatar>
    <NAvatar
      v-if="github && user.githubAvatar"
      :key="`avatar-github-${user.firnId}`"
      :src="user.githubAvatar"
      :alt="name"
      :square="size"
      avatar="solid-primary"
    />
  </NAvatarGroup>
</template>
