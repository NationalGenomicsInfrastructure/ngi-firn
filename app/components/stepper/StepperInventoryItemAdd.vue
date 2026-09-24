<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { toTypedSchema } from '@vee-validate/zod'
import {
  createItemSchema,
  type CreateItemFormValues,
  type ItemParentKind,
  type ItemType
} from '~~/schemas/inventory/items'
import { createItem } from '~/utils/mutations/inventory/items'
import { acceptedItemCapacityQuery } from '~/utils/queries/inventory/items'
import { EQUIPMENT_FORM_LABEL_STYLE, type SelectOption } from '~/utils/inventory/equipment'
import { ITEM_TYPE_LABELS, ITEM_TYPE_OPTIONS, resolveItemTypeFromSelect } from '~/utils/inventory/item'
import {
  TEMPERATURE_CATEGORY_OPTIONS,
  formatTemperature,
  resolveTemperatureCategoryFromSelect
} from '~/utils/inventory/temperature'
import type { TemperatureCategory } from '~~/schemas/inventory/temperature'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{
  parentSlug: string
  parentKind: ItemParentKind
  initialValues?: Partial<CreateItemFormValues>
  submitLabel?: string
}>()

const emit = defineEmits<{
  created: []
}>()

const STEP1_FIELDS = ['category', 'name'] as const
type StepField = typeof STEP1_FIELDS[number]

const CLASSIFICATION_OPTIONS: SelectOption<string>[] = [
  { value: 'Sample', label: 'Sample' },
  { value: 'Reagent', label: 'Reagent' },
  { value: 'Control', label: 'Control' },
  { value: 'Library', label: 'Library' },
  { value: 'Consumable', label: 'Consumable' },
  { value: 'Equipment', label: 'Equipment' },
  { value: 'Other', label: 'Other' }
]

const items = [
  { title: 'Basics', description: 'Set item type and labels', icon: 'i-lucide-info', stage: 1 },
  { title: 'Details', description: 'Add optional stock details', icon: 'i-lucide-flask-conical', stage: 2 },
  { title: 'Review', description: 'Confirm and register', icon: 'i-lucide-clipboard-check', stage: 3 }
]

const stepper = useTemplateRef('itemStepper')
const { mutateAsync: createItemAsync } = createItem()
const itemFormSchema = toTypedSchema(createItemSchema.omit({ parentSlug: true, parentKind: true, position: true, projectIds: true }))

const defaultInitialValues: CreateItemFormValues = {
  category: 'cryovial',
  classification: undefined,
  name: '',
  label: '',
  description: '',
  quantity: undefined,
  unit: '',
  concentration: undefined,
  concentrationUnit: '',
  temperatureCategory: undefined,
  temperatureCelsius: undefined,
  arrivalDate: '',
  openingDate: '',
  expiryDate: '',
  lotNumber: '',
  barcode: '',
  templateId: '',
  notes: '',
  metadata: undefined
}

const formInitialValues: CreateItemFormValues = {
  ...defaultInitialValues,
  ...structuredClone(props.initialValues ?? {})
}

const { handleSubmit, validate, errors, resetForm, values } = useForm({
  validationSchema: itemFormSchema,
  initialValues: formInitialValues,
  keepValuesOnUnmount: true
})

const { value: categoryValue, setValue: setCategoryValue } = useField<ItemType>('category')
const { value: classificationValue, setValue: setClassificationValue } = useField<string | undefined>('classification')
const { value: quantityValue, setValue: setQuantityValue } = useField<number | undefined>('quantity')
const { value: concentrationValue, setValue: setConcentrationValue } = useField<number | undefined>('concentration')
const { value: temperatureValue, setValue: setTemperatureValue } = useField<number | undefined>('temperatureCelsius')
const { value: temperatureCategoryValue, setValue: setTemperatureCategoryValue } = useField<TemperatureCategory | undefined>('temperatureCategory')

const {
  state: acceptanceState,
  asyncStatus: acceptanceStatus
} = useQueryColada(() => ({
  ...acceptedItemCapacityQuery({ parentSlug: props.parentSlug, parentKind: props.parentKind }),
  enabled: props.parentKind === 'container'
}))

const isLoadingAcceptance = computed(() =>
  props.parentKind === 'container'
  && acceptanceStatus.value === 'loading'
  && acceptanceState.value.status !== 'success'
)
const acceptanceError = computed(() =>
  props.parentKind === 'container' && acceptanceState.value.status === 'error'
    ? acceptanceState.value.error?.message ?? 'Something went wrong while checking item capacity.'
    : undefined
)
const availableCapacity = computed(() =>
  props.parentKind === 'container' && acceptanceState.value.status === 'success'
    ? acceptanceState.value.data.filter(entry => entry.free > 0)
    : []
)
const availableCategories = computed<SelectOption<ItemType>[]>(() =>
  props.parentKind === 'equipment'
    ? ITEM_TYPE_OPTIONS
    : availableCapacity.value.map((entry) => {
        const category = entry.type as ItemType
        return { value: category, label: `${ITEM_TYPE_LABELS[category]} (${entry.free} left)` }
      })
)
const acceptanceBlocked = computed(() =>
  props.parentKind === 'container'
  && !isLoadingAcceptance.value
  && !acceptanceError.value
  && availableCategories.value.length === 0
)
const selectedCategoryLabel = computed(() => ITEM_TYPE_LABELS[categoryValue.value] ?? '—')
const quantityInputValue = computed(() => quantityValue.value == null ? '' : String(quantityValue.value))
const concentrationInputValue = computed(() => concentrationValue.value == null ? '' : String(concentrationValue.value))
const temperatureInputValue = computed(() => temperatureValue.value == null ? '' : String(temperatureValue.value))
const showCustomTemperature = computed(() => temperatureCategoryValue.value === 'other')

watch(availableCategories, (categories) => {
  if (categories.length === 0) return
  if (!categories.some(option => option.value === categoryValue.value)) {
    setCategoryValue(categories[0]!.value)
  }
}, { immediate: true })

function resolveClassification(value: unknown): string | undefined {
  if (typeof value === 'string' && CLASSIFICATION_OPTIONS.some(option => option.value === value)) return value
  if (value && typeof value === 'object' && 'value' in value) {
    const selected = (value as { value?: unknown }).value
    if (typeof selected === 'string' && CLASSIFICATION_OPTIONS.some(option => option.value === selected)) return selected
  }
  return undefined
}

function resolveNullableNumber(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function onCategoryUpdate(value: unknown) {
  const category = resolveItemTypeFromSelect(value)
  if (category && availableCategories.value.some(option => option.value === category)) setCategoryValue(category)
}

function onTemperatureCategoryUpdate(value: unknown) {
  const resolved = resolveTemperatureCategoryFromSelect(value)
  setTemperatureCategoryValue(resolved ?? undefined)
  if (resolved !== 'other') setTemperatureValue(undefined)
}

function onTemperatureUpdate(value: unknown) {
  setTemperatureValue(resolveNullableNumber(value))
}

function resetToFirstStep() {
  stepper.value?.goToStep(0)
}

async function validateStep(requiredFields: readonly StepField[]): Promise<boolean> {
  await validate()
  const stageErrors: Record<string, unknown> = {}
  for (const field of requiredFields) {
    if (errors.value[field]) stageErrors[field] = errors.value[field]
  }
  if (Object.keys(stageErrors).length === 0) return true
  await focusFirstFormFieldError(stageErrors)
  return false
}

async function nextFromStep1() {
  if (await validateStep(STEP1_FIELDS)) stepper.value?.nextStep()
}

const onSubmit = handleSubmit(async (formValues) => {
  const result = await createItemAsync({
    ...formValues,
    parentSlug: props.parentSlug,
    parentKind: props.parentKind
  })
  if (result) {
    resetForm()
    resetToFirstStep()
    emit('created')
  }
})

async function onValidatingSubmit() {
  await validate()
  await focusFirstFormFieldError(errors.value)
  onSubmit()
}
</script>

<template>
  <div>
    <NAlert
      v-if="isLoadingAcceptance"
      alert="border-gray"
      title="Checking item capacity..."
      description="Determining which item types this container can still accept."
      icon="i-lucide-loader-2"
    />
    <NAlert
      v-else-if="acceptanceError"
      alert="border-error"
      title="Could not check capacity"
      :description="acceptanceError"
      icon="i-lucide-alert-circle"
    />
    <NAlert
      v-else-if="acceptanceBlocked"
      alert="border-warning"
      title="No free item capacity"
      description="This container does not accept any item type with free capacity. Free a slot or adjust its capacity before registering an item."
      icon="i-lucide-package-x"
    />

    <NStepper
      v-else
      ref="itemStepper"
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
              title="Item basics"
              description="Set the item type and visible labels."
              card="outline-gray"
              :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NFormField
                  name="category"
                  label="Item type"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NSelect
                    :model-value="categoryValue"
                    :items="availableCategories"
                    by="value"
                    @update:model-value="onCategoryUpdate"
                  />
                </NFormField>
                <NFormField
                  name="classification"
                  label="Classification"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NSelect
                    :model-value="classificationValue"
                    :items="CLASSIFICATION_OPTIONS"
                    by="value"
                    @update:model-value="(value: unknown) => setClassificationValue(resolveClassification(value))"
                  />
                </NFormField>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NFormField
                  name="name"
                  label="Name"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="e.g. Sample batch 42" />
                </NFormField>
                <NFormField
                  name="label"
                  label="Additional label"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE, formDescription: 'text-muted' }"
                >
                  <NInput placeholder="Optional" />
                </NFormField>
              </div>
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
            v-else-if="item.stage === 2"
            class="mx-auto p-4 space-y-4 w-full"
            @submit.prevent="stepper?.nextStep()"
          >
            <NCard
              title="Item details"
              description="Add optional quantity, identification and date details."
              card="outline-gray"
              :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NFormField
                  name="quantity"
                  label="Quantity"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput
                    :model-value="quantityInputValue"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Optional"
                    @update:model-value="(value: unknown) => setQuantityValue(resolveNullableNumber(value))"
                  />
                </NFormField>
                <NFormField
                  name="unit"
                  label="Unit"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="e.g. µL, mg" />
                </NFormField>
                <NFormField
                  name="concentration"
                  label="Concentration"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput
                    :model-value="concentrationInputValue"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Optional"
                    @update:model-value="(value: unknown) => setConcentrationValue(resolveNullableNumber(value))"
                  />
                </NFormField>
                <NFormField
                  name="concentrationUnit"
                  label="Concentration unit"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="e.g. ng/µL" />
                </NFormField>
                <NFormField
                  name="temperatureCategory"
                  label="Temperature"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NSelect
                    :model-value="temperatureCategoryValue"
                    :items="TEMPERATURE_CATEGORY_OPTIONS"
                    by="value"
                    placeholder="Optional"
                    @update:model-value="onTemperatureCategoryUpdate"
                  />
                </NFormField>
                <NFormField
                  v-if="showCustomTemperature"
                  name="temperatureCelsius"
                  label="Custom temperature (°C)"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput
                    :model-value="temperatureInputValue"
                    type="number"
                    step="0.1"
                    placeholder="e.g. -150"
                    @update:model-value="onTemperatureUpdate"
                  />
                </NFormField>
                <NFormField
                  name="lotNumber"
                  label="Lot number"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="Optional" />
                </NFormField>
                <NFormField
                  name="barcode"
                  label="Barcode"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="Optional" />
                </NFormField>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NFormField
                  name="arrivalDate"
                  label="Arrival date"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput type="date" />
                </NFormField>
                <NFormField
                  name="openingDate"
                  label="Opening date"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput type="date" />
                </NFormField>
                <NFormField
                  name="expiryDate"
                  label="Expiry date"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput type="date" />
                </NFormField>
              </div>
              <NFormField
                name="notes"
                label="Notes"
                :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
              >
                <NInput
                  type="textarea"
                  :rows="3"
                  placeholder="Optional notes"
                />
              </NFormField>
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
              title="Review"
              description="Confirm the item before registering it."
              card="soft-gray"
              :una="{ cardDescription: 'text-muted' }"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Type
                  </p><p class="font-medium">
                    {{ selectedCategoryLabel }}
                  </p>
                </div>
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Classification
                  </p><p class="font-medium">
                    {{ values.classification || '—' }}
                  </p>
                </div>
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Name
                  </p><p class="font-medium">
                    {{ values.name || '—' }}
                  </p>
                </div>
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Quantity
                  </p><p class="font-medium">
                    {{ values.quantity == null ? '—' : `${values.quantity}${values.unit ? ` ${values.unit}` : ''}` }}
                  </p>
                </div>
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Lot number
                  </p><p class="font-medium">
                    {{ values.lotNumber || '—' }}
                  </p>
                </div>
                <div>
                  <p :class="EQUIPMENT_FORM_LABEL_STYLE">
                    Temperature
                  </p><p class="font-medium">
                    {{ formatTemperature(values.temperatureCategory ?? null, values.temperatureCelsius ?? null) }}
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
                :label="props.submitLabel ?? 'Register item'"
                btn="soft-primary hover:outline-primary"
                trailing="i-lucide-package-plus"
              />
            </div>
          </form>
        </div>
      </template>
    </NStepper>
  </div>
</template>
