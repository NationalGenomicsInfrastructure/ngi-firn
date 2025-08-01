<script setup lang="ts">
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
  queryCache.invalidateQueries({ key: USERS_QUERY_KEYS.root })
  emit('update:allowLogin', formData.value.allowLogin)
  emit('update:isRetired', formData.value.isRetired)
  emit('update:isAdmin', formData.value.isAdmin)
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
