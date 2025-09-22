<script setup lang="ts">
import { DateTime } from 'luxon'
import { toTypedSchema } from '@vee-validate/zod'
import { generateFirnUserTokenSchema } from '~~/schemas/tokens'
import { generateFirnUserToken } from '~/utils/mutations/tokens'

// Stepper

const items = [
  {
    title: 'Configure',
    description: 'Configure the settings for the new token',
    icon: 'i-lucide-settings',
    stage: 1
  },
  {
    title: 'Save',
    description: 'Save the new token in a safe place',
    icon: 'i-lucide-qr-code',
    stage: 2
  },
  {
    title: 'Ready',
    description: 'You can now use the new token',
    icon: 'i-lucide-check-circle',
    stage: 3
  }
]

const stepper = useTemplateRef('tokenStepper')

// Token configuration form

const tokenFormData = reactive({
  expiresAt: DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd'),
  period: [7],
  audience: ref('')
})


const onDateUpdate = (value: string | undefined) => {
  if (!value) return
  const days = Math.floor(DateTime.fromFormat(value, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days)
  if (days < 1 || days > 365) {
    validate()
    tokenFormData.expiresAt = DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd')
    return
  }
  tokenFormData.expiresAt = value
  tokenFormData.period = [days]
}

const onPeriodUpdate = (value: number[] | undefined) => {
  if (!value) return
  tokenFormData.period = value
  tokenFormData.expiresAt = DateTime.now().plus({ days: tokenFormData.period[0] }).toFormat('yyyy-MM-dd')
}

const formSchema = toTypedSchema(generateFirnUserTokenSchema)

const { handleSubmit, validate, errors, resetForm } = useForm({
  validationSchema: formSchema
})

const token = ref('')

const onSubmit = handleSubmit(async (values) => {
  try {
    // in this case, we use the async version of the mutation to act on the failure.
    console.log(values)
    console.log("Submitting form...")
    const { mutateAsync } = generateFirnUserToken()
    const result = await mutateAsync(values)
    if (result) {
      // Success message is handled by mutation
      token.value = result.jwt
      resetForm()
    }
    else {
      showError(`A token for your user could not be created.`, 'Token creation error', { actions: toastActions })
    }
  }
  catch (error) {
    showError(`No token could be created: ${error}`, 'Token creation error', { actions: toastActions })
  }
})

async function onValidating() {
  console.log("Validating form...")
  await validate()
  console.log(errors.value)

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

// Token generation

const { showError } = useFirnToast()
const toastActions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      onSubmit()
    }
  },
  {
    label: 'Dismiss',
    btn: 'solid-white',
    altText: 'Error',
    onClick: () => {
      resetForm()
    }
  }
]
</script>

<template>
  <NStepper
    ref="tokenStepper"
    :items="items"
  >
    <template #content="{ item }">
      <div class="h-full flex flex-col p-2 sm:p-4">
        <form
          v-if="item.stage === 1"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="onValidating()"
        >
          <div class="flex flex-col sm:flex-row gap-2 p-auto">
            <NCard
              title="Token expiration"
              description="Choose an expiration date or a validity period"
              card="outline-gray"
              class="flex-1 max-w-sm sm:w-1/2"
              :una="{
                cardContent: 'space-y-4',
                cardDescription: 'text-accent'
              }"
            >
              <NFormField
                name="expiresAt"
                label="Pick a date"
              >
                <!-- The v-model shorthand is not used on this input because a custom update handler is required. See https://vuejs.org/guide/components/v-model.html#under-the-hood -->
                <NInput
                  :modelValue="tokenFormData.expiresAt"
                  type="date"
                  @update:modelValue="onDateUpdate"
                />
              </NFormField>
              <NSeparator
                label="OR"
                class="mx-2 my-4"
              />
              <NFormGroup
                name="period"
                label="Choose a period"
                :message="`${tokenFormData.period.toString()} days`"
              >
                <!-- No v-model shorthand as above -->
                <NSlider
                  :modelValue="tokenFormData.period"
                  :min="1"
                  :max="365"
                  :step="1"
                  @update:modelValue="onPeriodUpdate"
                />
              </NFormGroup>
            </NCard>
            <NCard
              title="Token audience"
              description="Optionally restrict the token to a specific functionality"
              card="outline-gray"
              class="flex-1 max-w-sm sm:w-1/2"
              :una="{
                cardContent: 'space-y-4',
                cardDescription: 'text-accent'
              }"
            >
              <NFormField
                name="audience"
                description="Select an audience for your new token"
              >
                <div class="flex flex-row gap-2">
                  <NSelect
                    v-model="tokenFormData.audience"
                    placeholder="No restriction"
                    :items="['User Login', 'API Access']"
                  />
                  <NButton
                    v-if="tokenFormData.audience"
                    btn="soft-error hover:outline-error"
                    label="i-lucide-x-circle"
                    icon
                    @click="tokenFormData.audience = ''"
                  />
                </div>
              </NFormField>
            </NCard>
          </div>
          <NButton
            label="Generate token"
            btn="soft-primary hover:outline-primary"
            type="submit"
          />
        </form>
        <div v-if="item.stage === 2" class="flex flex-col sm:flex-row gap-2 p-auto">
          <NCard
            title="Token"
            description="The generated token"
            card="outline-gray"
          >
            <NInput
              v-model="token"
              type="text"
              readonly
            />
          </NCard>
        </div>
      </div>
    </template>
  </NStepper>
  <div class="mx-auto mt-4 max-w-2xl flex justify-between gap-2">
    <NButton
      label="prev"
      btn="soft-primary hover:outline-primary"
      leading="i-lucide-arrow-left"
      @click="stepper?.prevStep()"
    />
    <NButton
      label="next"
      btn="soft-primary hover:outline-primary"
      trailing="i-lucide-arrow-right"
      @click="stepper?.nextStep()"
    />
  </div>
</template>
