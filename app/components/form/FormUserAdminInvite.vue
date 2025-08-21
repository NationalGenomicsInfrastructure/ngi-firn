<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createUserByAdminSchema } from '~~/schemas/users'
import { createUserByAdmin } from '~/utils/mutations/users'

const { showError} = useFirnToast()
const toastActions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      onSubmit()
    },
  },
  {
    label: 'Dismiss',
    btn: 'solid-white',
    altText: 'Error',
    onClick: () => {
      resetForm()
    },
  },
]

const formSchema = toTypedSchema(createUserByAdminSchema)

const { handleSubmit, validate, errors, resetForm } = useForm({
  validationSchema: formSchema,
})
const onSubmit = handleSubmit(async (values) => {
  try {
    // in this case, we use the async version of the mutation to act on the failure.
    const { mutateAsync } = createUserByAdmin()
    const result = await mutateAsync(values)
    if (result) {
      // Success message is handled by mutation
      resetForm()
    } else {
      showError(`User account for ${values.googleGivenName} ${values.googleFamilyName} could not be created.`, 'Account creation error', { actions: toastActions })
    }
  } catch (error) {
    showError(`User account for ${values.googleGivenName} ${values.googleFamilyName} could not be created: ${error}`, 'Account creation error', { actions: toastActions })
  }
})


async function onValidating() {
  await validate()

  const firstErrorField = Object.keys(errors.value)[0]
  if (firstErrorField) {
    const firstErrorFieldElement = document.querySelector(`[name=${firstErrorField}]`) as HTMLElement
    if (firstErrorFieldElement) {
      firstErrorFieldElement.focus()
      firstErrorFieldElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  onSubmit()
}
</script>

<template>
  <form
    class="mx-auto max-w-sm p-4 space-y-4"
    @submit.prevent="onValidating()"
  >
  <NFormField
      name="googleGivenName"
      label="First name"
    >
      <NInput placeholder="First name" />
    </NFormField>
    <NFormField
      name="googleFamilyName"
      label="Last name"
    >
      <NInput placeholder="Family name" />
    </NFormField>
    <NFormField
      name="googleEmail"
      label="SciLifeLab email"
    >
      <NInput placeholder="@scilifelab.se email" />
    </NFormField>

    <NFormField
      name="isAdmin"
      label="Administrator"
      description="Make the user an administrator of the system"
    >
      <NCheckbox
        label="Firn administrator"
        :default-value="false"
      />
    </NFormField>


    <NButton type="submit" 
    btn="soft-primary hover:outline-primary"
    leading="i-lucide-user-plus"
    >
      Pre-create user account
    </NButton>
  </form>
</template>
