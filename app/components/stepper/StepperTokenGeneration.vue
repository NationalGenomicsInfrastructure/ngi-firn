<script setup lang="ts">
import { DateTime } from 'luxon'
import { useClipboard } from '@vueuse/core'
import { toTypedSchema } from '@vee-validate/zod'
import { generateFirnUserTokenSchema } from '~~/schemas/tokens'
import { generateFirnUserToken } from '~/utils/mutations/tokens'

// Stepper

const items = [
  {
    title: 'Create',
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
    title: 'Test',
    description: 'You can now use the new token',
    icon: 'i-lucide-check-circle',
    stage: 3
  }
]

const audienceItems = ['User Login', 'API Access']

const renderAsQR = ref(false)
const tokenTypeItems = [
  { value: 'barcode' as const, label: 'Barcode', description: 'Can be used with the external barcode scanner and recognized by the camera.' },
  { value: 'qrcode' as const, label: 'QR Code', description: 'Can only be used on a device with a camera.' }
]

const onRenderAsUpdate = (value: string | undefined) => {
  if (!value) return
  renderAsQR.value = value === 'qrcode'
}

const stepper = useTemplateRef('tokenStepper')

/*
 * Token generation form
 */

const formSchema = toTypedSchema(generateFirnUserTokenSchema)

// Initialize the form with default values
const { handleSubmit, validate, errors, resetForm, values, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    expiresAt: DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd'),
    period: [7],
    audience: '',
    tokenType: 'barcode'
  }
})

/*
 * Token generation form: mutual interaction between fields
 */

// Use field for audience to ensure proper reactivity
const { value: audienceValue, setValue: setAudienceValue } = useField<string>('audience')

// Custom handlers that update both the related fields
const onDateUpdate = (value: string | undefined) => {
  if (!value) return
  const days = Math.floor(DateTime.fromFormat(value, 'yyyy-MM-dd').diff(DateTime.now(), 'days').days)
  if (days < 1 || days > 365) {
    validate()
    const defaultDate = DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd')
    setFieldValue('expiresAt', defaultDate)
    setFieldValue('period', [7])
    return
  }
  setFieldValue('expiresAt', value)
  setFieldValue('period', [days])
}

const onPeriodUpdate = (value: number[] | undefined) => {
  if (!value) return
  const newDate = DateTime.now().plus({ days: value[0] }).toFormat('yyyy-MM-dd')
  setFieldValue('period', value)
  setFieldValue('expiresAt', newDate)
}

/*
 * Token generation form: validation and submit handlers
 */

const token = ref('')
const tokenID = ref('')

const onSubmit = handleSubmit(async (values) => {
  try {
    // in this case, we use the async version of the mutation to act on the failure.
    const { mutateAsync } = generateFirnUserToken()
    const result = await mutateAsync(values)
    if (result) {
      token.value = result.jwt
      tokenID.value = result.tokenID
      resetForm()
      stepper?.value?.nextStep()
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

/*
 * Token saving: Clipboard and QR code
 */

const { copy, copied } = useClipboard({ source: token })
const { downloadTokenQR, previewTokenQR } = useTokenQR()
const { downloadTokenBarcode, previewTokenBarcode } = useTokenBarcode()
const { user: sessionUser } = useUserSession()
</script>

<template>
  <NStepper
    ref="tokenStepper"
    :items="items"
  >
    <template #content="{ item }">
      <div class="h-full flex flex-col p-2 sm:p-4 mx-auto">
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
                  :model-value="values.expiresAt"
                  type="date"
                  @update:model-value="onDateUpdate"
                />
              </NFormField>
              <NSeparator
                label="OR"
                class="mx-2 my-4"
              />
              <NFormGroup
                name="period"
                label="Choose a period"
                :message="`${values.period?.toString()} days`"
              >
                <NSlider
                  :model-value="values.period"
                  :min="1"
                  :max="365"
                  :step="1"
                  @update:model-value="onPeriodUpdate"
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
                    v-model="audienceValue"
                    placeholder="No restriction"
                    :items="audienceItems"
                  />
                  <NButton
                    v-if="audienceValue"
                    btn="soft-error hover:outline-error"
                    label="i-lucide-x-circle"
                    icon
                    @click="setAudienceValue('')"
                  />
                </div>
              </NFormField>
            </NCard>
          </div>
          <NCard
            title="Token representation"
            description="Choose between a compact and a verbose representation of the token"
            card="outline-gray"
            class="flex-1 w-full"
            :una="{
              cardContent: 'space-y-4',
              cardDescription: 'text-accent'
            }"
          >
            <NFormField
              name="tokenType"
            >
              <NRadioGroup
                :model-value="values.tokenType || 'barcode'"
                :items="tokenTypeItems"
                @update:model-value="onRenderAsUpdate"
              />
            </NFormField>
          </NCard>
          <NButton
            label="Generate token"
            btn="soft-primary hover:outline-primary"
            class="w-full"
            type="submit"
            size="md"
          />
        </form>
        <div
          v-if="item.stage === 2"
          class="flex flex-col gap-2 p-auto"
        >
          <NCard
            title="Your new token"
            description="This is the only time you will see this token. Copy it to your clipboard and store it in a safe place."
            card="outline-gray"
          >
            <form
              class="flex gap-2"
              @submit.prevent="copy(token)"
            >
              <NInput
                v-model="token"
                leading="i-lucide-key-round"
                :una="{
                  inputWrapper: 'w-full'
                }"
                read-only
              />
              <NTooltip
                content="Copy this token to your clipboard"
              >
                <NButton
                  icon
                  square
                  type="submit"
                  :btn="copied ? 'solid-primary' : 'soft-primary hover:outline-primary'"
                  :label="!copied ? 'i-lucide-copy' : 'i-lucide-check'"
                />
              </NTooltip>
            </form>
            <NSeparator
              label="OR"
              class="mx-2 my-4"
            />
            <div v-if="renderAsQR">
              <ImagesQR
                v-if="token"
                :value="token"
                foreground="var(--una-primary-hex)"
                background="var(--c-background)"
                class="mx-auto my-15 scale-150"
              />
              <div class="flex flex-row gap-2 justify-between">
                <NButton
                  label="Open a printable QR code with your token"
                  btn="soft-primary hover:outline-primary"
                  :disabled="!token"
                  @click="previewTokenQR(token, tokenID, sessionUser?.name || 'incognito')"
                />
                <NButton
                  label="Download a PDF with QR code of your token"
                  btn="soft-primary hover:outline-primary"
                  :disabled="!token"
                  @click="downloadTokenQR(token, tokenID, sessionUser?.name || 'incognito')"
                />
              </div>
            </div>
            <div v-else>
              <ImagesBarcode
                v-if="token"
                :value="token"
                :options="{ format: 'CODE128',
                            background: 'var(--c-background)',
                            lineColor: 'var(--una-primary-hex)',
                            displayValue: true }"
              />
              <div class="flex flex-row gap-2 justify-between">
                <NButton
                  label="Open a printable QR code with your token"
                  btn="soft-primary hover:outline-primary"
                  :disabled="!token"
                  @click="previewTokenBarcode(token, tokenID, sessionUser?.name || 'incognito')"
                />
                <NButton
                  label="Download a PDF with QR code of your token"
                  btn="soft-primary hover:outline-primary"
                  :disabled="!token"
                  @click="downloadTokenBarcode(token, tokenID, sessionUser?.name || 'incognito')"
                />
              </div>
            </div>
          </NCard>
        </div>
        <FormValidateToken
          v-if="item.stage === 3"
          :audience-items="audienceItems"
        />
      </div>
    </template>
  </NStepper>
  <div class="mx-auto mt-4 max-w-2xl flex justify-between gap-2">
    <NButton
      label="prev"
      btn="solid-gray hover:outline-secondary"
      leading="i-lucide-arrow-left"
      :disabled="!stepper?.hasPrev()"
      @click="stepper?.prevStep()"
    />
    <NButton
      label="next"
      btn="solid-gray hover:outline-secondary"
      trailing="i-lucide-arrow-right"
      :disabled="!stepper?.hasNext()"
      @click="stepper?.nextStep()"
    />
  </div>
</template>
