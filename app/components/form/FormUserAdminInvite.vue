<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createUserByAdminSchema } from '~~/schemas/users'
import { createUserByAdmin } from '~/utils/mutations/users'

const formSchema = toTypedSchema(createUserByAdminSchema)

const { handleSubmit, validate, errors } = useForm({
  validationSchema: formSchema,
})
const onSubmit = handleSubmit(async (values) => {
  try {
    const { mutateAsync } = createUserByAdmin()
    const result = await mutateAsync(values)
    if (result) {
      console.log('User created successfully')
    } else {
      console.log('User creation failed')
    }
  } catch (error) {
    console.error(error)
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


    <NButton type="submit">
      Invite user
    </NButton>
  </form>
</template>
