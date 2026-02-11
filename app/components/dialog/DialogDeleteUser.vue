<script setup lang="ts">
import { deleteUserByAdmin } from '~/utils/mutations/users'

const { user } = useUserSession()

const props = defineProps<{
  googleId: number
  googleGivenName: string
  googleFamilyName: string
}>()

// Handle save action
const handleDelete = () => {
  const { deleteUser } = deleteUserByAdmin()
  deleteUser({
    googleId: props.googleId,
    googleGivenName: props.googleGivenName,
    googleFamilyName: props.googleFamilyName
  })
}

const isDisabled = computed(() => {
  return user.value?.givenName == props.googleGivenName && user.value?.familyName == props.googleFamilyName
})
</script>

<template>
  <NDialog
    title="Delete User"
    description="Are you sure you want to delete the user from Firn?"
  >
    <template #trigger>
      <NButton
        :label="isDisabled ? 'Cannot delete self' : 'Delete user'"
        class="min-w-60 transition delay-300 ease-in-out"
        btn="soft-error hover:outline-error"
        :trailing="isDisabled ? 'i-lucide-ban' : 'i-lucide-user-x'"
        :disabled="isDisabled"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This action will permanently remove <span class="font-semibold text-error">{{ props.googleGivenName }} {{ props.googleFamilyName }}</span> from Firn and all associated data will be deleted.
      </p>
      <p class="text-muted">
        Since event logs or comments may point to the user, it is recommended to retire accounts of former colleagues instead, which will keep the user in the system but prevent them from logging in. Like so, we will still have the human-readable names associated with the logs rather than an anonymous technical document ID.
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
            label="Delete User"
            class="transition delay-300 ease-in-out"
            btn="soft-error hover:outline-error"
            trailing="i-lucide-user-x"
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
