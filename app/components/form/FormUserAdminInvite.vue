<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createUserByAdminSchema } from '~~/schemas/users'

const formSchema = toTypedSchema(createUserByAdminSchema)

const { handleSubmit, validate, errors } = useForm({
  validationSchema: formSchema,
})
const onSubmit = handleSubmit((values) => {
  alert(JSON.stringify(values, null, 2))
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
      />
    </NFormField>


    <NButton type="submit">
      Invite user
    </NButton>
  </form>
</template>
