<script setup lang="ts">
import type { DisplayUserToAdmin } from '~~/types/auth'
import { USERS_QUERY_KEYS } from '~/utils/queries/users'

const props = defineProps<{
  googleGivenName: string
  googleFamilyName: string
  googleEmail: string
  allowLogin: boolean
  isRetired: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'update:allowLogin' | 'update:isRetired' | 'update:isAdmin', value: boolean): void
}>()

// User states
const userStateOptions = ref([
  { value: 'pending', label: 'Pending', description: 'User has not yet been approved', icon: 'i-lucide-user-lock' },
  { value: 'active', label: 'Active', description: 'User is active and can log in', icon: 'i-lucide-briefcase-business' },
  { value: 'retired', label: 'Retired', description: 'User is retired and cannot log in', icon: 'i-lucide-rocking-chair' }
])

// Function to translate boolean values to user state
const translateBooleansToUserState = (allowLogin: boolean, isRetired: boolean) => {
  if (isRetired) return 'retired'
  if (allowLogin) return 'active'
  return 'pending'
}

// Function to translate user state to boolean values
const translateUserStateToBooleans = (state: string) => {
  switch (state) {
    case 'pending':
      return { allowLogin: false, isRetired: false }
    case 'active':
      return { allowLogin: true, isRetired: false }
    case 'retired':
      return { allowLogin: false, isRetired: true }
    default:
      return { allowLogin: false, isRetired: false }
  }
}

// Initialize current user state based on props
const currentUserState = ref(translateBooleansToUserState(props.allowLogin, props.isRetired))

// Local reactive state for the form
const formData = ref({
  allowLogin: props.allowLogin,
  isRetired: props.isRetired,
  isAdmin: props.isAdmin
})

// Watch for changes in currentUserState and update formData accordingly
watch(currentUserState, (newState) => {
  const { allowLogin, isRetired } = translateUserStateToBooleans(newState)
  formData.value.allowLogin = allowLogin
  formData.value.isRetired = isRetired
})

// Query cache
const queryCache = useQueryCache()

// Handle save action
const handleSave = () => {
  // Emit v-model changes to update the expanded row immediately
  emit('update:allowLogin', formData.value.allowLogin)
  emit('update:isRetired', formData.value.isRetired)
  emit('update:isAdmin', formData.value.isAdmin)

  // Optimistically update cached lists so tables reflect changes instantly
  const updateUserInLists = (lists: Array<DisplayUserToAdmin[] | undefined>) => {
    for (const list of lists) {
      if (!list) continue
      const currentList = list as DisplayUserToAdmin[]
      const idx = currentList.findIndex(u => u.googleEmail === props.googleEmail)
      if (idx !== -1) {
        const next = currentList.slice()
        const user: DisplayUserToAdmin = { ...next[idx] } as DisplayUserToAdmin
        user.allowLogin = formData.value.allowLogin
        user.isRetired = formData.value.isRetired
        user.isAdmin = formData.value.isAdmin
        next.splice(idx, 1, user)
        return next
      }
    }
    return undefined
  }

  const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved())
  const retired = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.retired())

  // Update the list where the user currently exists
  const updatedApproved = updateUserInLists([approved])
  if (updatedApproved) {
    queryCache.setQueryData(USERS_QUERY_KEYS.approved(), updatedApproved)
  }

  const updatedRetired = updateUserInLists([retired])
  if (updatedRetired) {
    queryCache.setQueryData(USERS_QUERY_KEYS.retired(), updatedRetired)
  }

  // If state changed across lists (active <-> retired), move user between lists optimistically
  if (approved && retired) {
    const wasInApproved = approved.some(u => u.googleEmail === props.googleEmail)
    const shouldBeRetired = formData.value.isRetired

    if (wasInApproved && shouldBeRetired) {
      const user = approved.find(u => u.googleEmail === props.googleEmail)!
      const updatedUser: DisplayUserToAdmin = { ...user } as DisplayUserToAdmin
      updatedUser.allowLogin = formData.value.allowLogin
      updatedUser.isRetired = formData.value.isRetired
      updatedUser.isAdmin = formData.value.isAdmin
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), approved.filter(u => u.googleEmail !== props.googleEmail))
      queryCache.setQueryData(USERS_QUERY_KEYS.retired(), [updatedUser, ...(retired ?? [])])
    }

    const wasInRetired = retired.some(u => u.googleEmail === props.googleEmail)
    const shouldBeActive = !formData.value.isRetired && formData.value.allowLogin
    if (wasInRetired && shouldBeActive) {
      const user = retired.find(u => u.googleEmail === props.googleEmail)!
      const updatedUser: DisplayUserToAdmin = { ...user } as DisplayUserToAdmin
      updatedUser.allowLogin = formData.value.allowLogin
      updatedUser.isRetired = formData.value.isRetired
      updatedUser.isAdmin = formData.value.isAdmin
      queryCache.setQueryData(USERS_QUERY_KEYS.retired(), retired.filter(u => u.googleEmail !== props.googleEmail))
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), [updatedUser, ...(approved ?? [])])
    }
  }

  // Do not invalidate or refetch here to avoid flicker; server sync will come with the real mutation later
}
</script>

<template>
  <NDialog
    title="Modify Permissions"
    description="Update user permissions and access settings"
  >
    <template #trigger>
      <NButton
        label="Administer user"
        class="transition delay-300 ease-in-out"
        btn="soft-primary hover:outline-primary"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
        <NRadioGroup
          v-model="currentUserState"
          :items="userStateOptions"
        />

        <NFormGroup
          :label="formData.isAdmin ? `${googleGivenName} can administer Firn.` : `${googleGivenName} cannot administer Firn.`"
          class="mt-5 font-semibold"
        >
          <NSwitch
            id="isAdmin"
            v-model="formData.isAdmin"
            size="lg"
            checked-icon="i-lucide-key-round"
            unchecked-icon="i-lucide-shield-off"
            :label="`${googleGivenName} can administer Firn.`"
          />
        </NFormGroup>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            class="transition delay-300 ease-in-out"
            btn="soft-gray hover:outline-gray"
          />
        </NDialogClose>
        <NDialogClose>
          <NButton
            label="Save Changes"
            class="transition delay-300 ease-in-out"
            btn="soft-success hover:outline-success"
            @click="handleSave"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
