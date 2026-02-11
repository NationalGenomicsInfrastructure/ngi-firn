<script setup lang="ts">
import { unlinkGitHubUserSelf } from '~/utils/mutations/users'

// Since the dialog will be embedded in the user's profile page, the user data is passed as props rather than using the user session again.
const props = defineProps<{
  githubId: number | null | undefined
  githubAvatar: string | null | undefined
  provider: string
}>()

// Handle save action
const handleUnlink = () => {
  const { unlinkGitHubUser } = unlinkGitHubUserSelf()
  unlinkGitHubUser()
}

const isDisabled = computed(() => {
  return props.githubId === null || props.githubId === undefined
})
</script>

<template>
  <NDialog
    title="Unlink your GitHub account from your Firn account?"
  >
    <template #trigger>
      <NButton
        :label="isDisabled ? 'No GitHub account linked' : 'Unlink GitHub account'"
        class="w-full transition delay-300 ease-in-out"
        btn="soft-primary hover:outline-primary"
        :leading="isDisabled ? 'i-lucide-ban' : 'i-simple-icons-github'"
        :disabled="isDisabled"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <div class="text-center space-y-2">
          <NAvatar
            v-if="props.githubAvatar"
            size="sm:3xl md:4xl lg:5xl"
            :src="props.githubAvatar"
            class="border-2 border-black rounded-full"
          />
      </div>
      <p class="text-muted">
        You won't be able to log in with your GitHub account to Firn anymore, so ensure that you can log in with Google or a token to Firn before unlinking your account.
      </p>
      <p v-if="props.provider === 'github'" class="text-warning">
        You are currently logged in with your GitHub account. You will be logged out after unlinking your account.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            class="transition delay-300 ease-in-out"
            btn="soft-gray hover:outline-gray"
            trailing="i-lucide-x"
          />
        </NDialogClose>
        <NDialogClose>
          <NButton
            label="Unlink GitHub account"
            class="transition delay-300 ease-in-out"
            btn="soft-error hover:outline-error"
            trailing="i-lucide-unlink"
            @click="handleUnlink"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
