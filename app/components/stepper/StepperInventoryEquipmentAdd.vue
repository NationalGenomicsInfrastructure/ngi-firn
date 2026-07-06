<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createEquipmentSchema } from '~~/schemas/inventory/equipment'
import { createEquipment } from '~/utils/mutations/inventory/equipment'
import {
  EQUIPMENT_FORM_LABEL_STYLE,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  resolveEquipmentTypeFromSelect,
  resolveNullableNumberFromInput
} from '~/utils/inventory/equipment'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{
  roomSlug: string
}>()

const emit = defineEmits<{
  created: []
}>()

const STEP1_FIELDS = ['equipmentType', 'name'] as const
type StepField = typeof STEP1_FIELDS[number]

const items = [
  {
    title: 'Basics',
    description: 'Set type and labels',
    icon: 'i-lucide-info',
    stage: 1
  },
  {
    title: 'Hardware',
    description: 'Set optional hardware details',
    icon: 'i-lucide-cog',
    stage: 2
  }
]

const stepper = useTemplateRef('equipmentStepper')
const { showError } = useFirnToast()

const equipmentFormSchema = toTypedSchema(
  createEquipmentSchema.omit({ parentSlug: true, capacity: true, temperatureSensorId: true })
)

const { handleSubmit, validate, errors, resetForm, values } = useForm({
  validationSchema: equipmentFormSchema,
  initialValues: {
    equipmentType: 'Freezer' as const,
    name: '',
    label: '',
    description: '',
    temperatureCelsius: undefined,
    manufacturer: '',
    model: '',
    serialNumber: '',
    isActive: true
  },
  keepValuesOnUnmount: true
})

const { value: equipmentTypeValue, setValue: setEquipmentTypeValue } = useField<string>('equipmentType')
const { value: temperatureValue, setValue: setTemperatureValue } = useField<number | undefined>('temperatureCelsius')

const temperatureInputValue = computed(() => temperatureValue.value == null ? '' : String(temperatureValue.value))

const selectedTypeLabel = computed(() =>
  equipmentTypeValue.value ? EQUIPMENT_TYPE_LABELS[equipmentTypeValue.value as keyof typeof EQUIPMENT_TYPE_LABELS] : '—'
)

function onEquipmentTypeUpdate(value: unknown) {
  const resolved = resolveEquipmentTypeFromSelect(value)
  if (resolved) {
    setEquipmentTypeValue(resolved)
  }
}

function onTemperatureUpdate(value: unknown) {
  setTemperatureValue(resolveNullableNumberFromInput(value))
}

function resetToFirstStep() {
  while (stepper?.value?.hasPrev()) {
    stepper.value.prevStep()
  }
}

async function validateStep(requiredFields: readonly StepField[]): Promise<boolean> {
  await validate()
  const stageErrors: Record<string, unknown> = {}
  for (const field of requiredFields) {
    const error = errors.value[field]
    if (error) {
      stageErrors[field] = error
    }
  }
  if (Object.keys(stageErrors).length === 0) {
    return true
  }
  await focusFirstFormFieldError(stageErrors)
  return false
}

async function nextFromStep1() {
  const isValid = await validateStep(STEP1_FIELDS)
  if (isValid) {
    stepper?.value?.nextStep()
  }
}

const onSubmit = handleSubmit(async (formValues) => {
  try {
    const { mutateAsync } = createEquipment()
    const result = await mutateAsync({ ...formValues, parentSlug: props.roomSlug })
    if (!result) {
      showError(`Equipment "${formValues.name}" could not be created.`, 'Equipment creation error')
      return
    }

    resetForm()
    resetToFirstStep()
    emit('created')
  }
  catch (error) {
    showError(`Equipment "${formValues.name}" could not be created: ${error}`, 'Equipment creation error')
  }
})

async function onValidatingSubmit() {
  await validate()
  await focusFirstFormFieldError(errors.value)
  onSubmit()
}
</script>

<template>
  <NStepper
    ref="equipmentStepper"
    :items="items"
  >
    <template #content="{ item }">
      <div class="h-full flex flex-col p-2 sm:p-4 mx-auto">
        <form
          v-if="item.stage === 1"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="nextFromStep1()"
        >
          <NCard
            title="Equipment basics"
            description="Set the type and visible labels."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFormField
                name="equipmentType"
                label="Equipment type"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NSelect
                  :model-value="equipmentTypeValue"
                  :items="EQUIPMENT_TYPE_OPTIONS"
                  by="value"
                  @update:model-value="onEquipmentTypeUpdate"
                />
              </NFormField>
              <NFormField
                name="isActive"
                label="Status"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE, formDescription: 'text-muted' }"
              >
                <NCheckbox label="Active?" />
              </NFormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFormField
                name="name"
                label="Name"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="e.g. Big freezer" />
              </NFormField>

              <NFormField
                name="label"
                label="Additional label"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE, formDescription: 'text-muted' }"
              >
                <NInput placeholder="Antarctica" />
              </NFormField>
            </div>

            <NFormField
              name="temperatureCelsius"
              label="Temperature (°C)"
              :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
            >
              <NInput
                :model-value="temperatureInputValue"
                type="number"
                step="0.1"
                placeholder="e.g. -80"
                @update:model-value="onTemperatureUpdate"
              />
            </NFormField>

            <NFormField
              name="description"
              label="Description"
              :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
            >
              <NInput
                type="textarea"
                :rows="3"
                placeholder="Optional notes"
              />
            </NFormField>
          </NCard>

          <div class="flex justify-end">
            <NButton
              type="submit"
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <form
          v-else
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="onValidatingSubmit()"
        >
          <NCard
            title="Hardware details"
            description="Optionally add manufacturer and serial information."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NFormField
                name="manufacturer"
                label="Manufacturer"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="Optional" />
              </NFormField>

              <NFormField
                name="model"
                label="Model"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="Optional" />
              </NFormField>

              <NFormField
                name="serialNumber"
                label="Serial number"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="Optional" />
              </NFormField>
            </div>
          </NCard>

          <NCard
            title="Review"
            description="Confirm the most important values before creating equipment."
            card="soft-gray"
            :una="{ cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Type
                </p>
                <p class="font-medium">
                  {{ selectedTypeLabel }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Name
                </p>
                <p class="font-medium">
                  {{ values.name || '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Label
                </p>
                <p class="font-medium">
                  {{ values.label || '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Temperature
                </p>
                <p class="font-medium">
                  {{ values.temperatureCelsius == null ? '—' : `${values.temperatureCelsius} °C` }}
                </p>
              </div>
            </div>
          </NCard>

          <div class="flex justify-between">
            <NButton
              type="button"
              label="Previous"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-arrow-left"
              @click="stepper?.prevStep()"
            />
            <NButton
              type="submit"
              label="Create equipment"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-layers-plus"
            />
          </div>
        </form>
      </div>
    </template>
  </NStepper>
</template>
