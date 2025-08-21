<script setup lang="ts">
import { setUserAccessByAdmin } from '~/utils/mutations/users'
const { user } = useUserSession()

const props = defineProps<{
  googleId: number
  googleGivenName: string
  googleFamilyName: string
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

// Check if the user is the same as the user being edited
const isDisabled = computed(() => {
  return user.value?.givenName == props.googleGivenName && user.value?.familyName == props.googleFamilyName
})

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

// Handle save action
const handleSave = () => {

  const { setUserAccess } = setUserAccessByAdmin()
  setUserAccess({
    googleId: props.googleId,
    googleGivenName: props.googleGivenName,
    googleFamilyName: props.googleFamilyName,
    allowLogin: formData.value.allowLogin,
    isRetired: formData.value.isRetired,
    isAdmin: formData.value.isAdmin
  })

  // Emit v-model changes to update the expanded row immediately
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
        :label="isDisabled ? 'Cannot edit self' : 'Administer user'"
        class="transition delay-300 ease-in-out"
        btn="soft-primary hover:outline-primary"
        :trailing="isDisabled ? 'i-lucide-ban' : 'i-lucide-user-pen'"
        :disabled="isDisabled"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
        <NRadioGroup
          v-model="currentUserState"
          :items="userStateOptions"
        />

        <NFormGroup
          :label="formData.isAdmin ? `${props.googleGivenName} can administer Firn.` : `${props.googleGivenName} cannot administer Firn.`"
          class="mt-5 font-semibold"
        >
          <NSwitch
            id="isAdmin"
            v-model="formData.isAdmin"
            size="lg"
            checked-icon="i-lucide-key-round"
            unchecked-icon="i-lucide-shield-off"
            :label="`${props.googleGivenName} can administer Firn.`"
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
            trailing="i-lucide-x"
          />
        </NDialogClose>
        <NDialogClose>
          <NButton
            label="Save Changes"
            class="transition delay-300 ease-in-out"
            btn="soft-success hover:outline-success"
            trailing="i-lucide-user-pen"
            @click="handleSave"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
