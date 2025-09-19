<script setup lang="ts">
import { DateTime } from 'luxon'
import { toTypedSchema } from '@vee-validate/zod'
import { generateFirnUserTokenSchema } from '~~/schemas/tokens'
import { generateFirnUserToken } from '~/utils/mutations/tokens'

// Stepper

const items = [
  {
    title: 'Configure token',
    description: 'Configure the settings for the new token',
    icon: 'i-lucide-settings',
    stage: 1,
  },
  {
    title: 'Generate token',
    description: 'Generate the new token',
    icon: 'i-lucide-key-round',
    stage: 2,
  },
  {
    title: 'Save token',
    description: 'Save the new token in a safe place',
    icon: 'i-lucide-qr-code',
    stage: 3,
  },
  {
    title: 'Ready',
    description: 'You can now use the new token',
    icon: 'i-lucide-check-circle',
    stage: 4,
  },
]

const stepper = useTemplateRef('tokenStepper')

// Token configuration form

const period = ref(7)
const expiresAt = ref(DateTime.now().plus({ days: period.value }).toFormat('mm/dd/yyyy'))

const onPeriodUpdate = (value: number) => {
  period.value = value
  expiresAt.value = DateTime.now().plus({ days: period.value }).toFormat('mm/dd/yyyy')
}

const formSchema = toTypedSchema(generateFirnUserTokenSchema)

const { handleSubmit, validate, errors, resetForm } = useForm({
  validationSchema: formSchema
})

const onSubmit = handleSubmit(async (values) => {
  try {
    // in this case, we use the async version of the mutation to act on the failure.
    const { mutateAsync } = generateFirnUserToken()
    const result = await mutateAsync(values)
    if (result) {
      // Success message is handled by mutation
      resetForm()
    }
    else {
      showError(`User account for ${values.googleGivenName} ${values.googleFamilyName} could not be created.`, 'Account creation error', { actions: toastActions })
    }
  }
  catch (error) {
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

  stepper.value?.nextStep()
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
  <NStepper ref="tokenStepper" :items="items">
    <template #content="{ item }">
      <NAspectRatio
        :ratio="16 / 4"
        class="mx-auto max-w-2xl"
      >
        <div class="h-full flex flex-col items-center justify-center p-2 sm:p-4">
          <form
            class="mx-auto max-w-sm p-4 space-y-4"
            @submit.prevent="onValidating()"
          >
            <NFormField
              name="expiresAt"
              label="Expiration date"
            >
              <NInput type="date" :value="expiresAt" />
            </NFormField>
            <NFormGroup
              name="period"
              label="Expiration period (days)"
            >
              <NSlider
                :min="1"
                :max="365"
                :step="1"
                :value="1"
                @update:value="onPeriodUpdate"
              />
            </NFormGroup>
          </form>
          <p>{{ item.title }}</p>
        </div>
      </NAspectRatio>
    </template>
  </NStepper>
  <div class="mx-auto mt-4 max-w-2xl flex justify-between gap-2">
    <NButton label="prev" leading="i-lucide-arrow-left" @click="stepper?.prevStep()" />
    <NButton label="next" trailing="i-lucide-arrow-right" @click="stepper?.nextStep()" />
  </div>
</template>
