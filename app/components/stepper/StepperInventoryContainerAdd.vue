<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createContainerSchema } from '~~/schemas/inventory-containers'
import type { CreateContainerSchemaInput } from '~~/schemas/inventory-containers'
import { createContainer } from '~/utils/mutations/inventory/containers'
import {
  ACCEPTED_CONTAINER_CATEGORY_OPTIONS,
  ACCEPTED_ITEM_CATEGORY_OPTIONS,
  CONTAINER_CLASSIFICATION_LABELS,
  CONTAINER_CLASSIFICATION_OPTIONS,
  CONTAINER_FORM_LABEL_STYLE,
  CONTAINER_TYPE_LABELS,
  CONTAINER_TYPE_OPTIONS,
  createEmptyContainerFormValues,
  mapContainerFormValuesToCreatePayload,
  resolveContainerClassificationFromSelect,
  resolveContainerTypeFromSelect,
  resolveNullableNumberFromInput,
  type ContainerFormSubmitValues
} from '~/utils/inventory/containers'
import { focusFirstFormFieldError } from '~/utils/inventory/rooms'

const props = defineProps<{
  parentId: string
}>()

const emit = defineEmits<{
  created: []
}>()

const STEP1_FIELDS = ['containerType', 'classification', 'name'] as const
const STEP2_FIELDS = ['rows', 'columns', 'levels', 'capacity'] as const
type StepField = typeof STEP1_FIELDS[number] | typeof STEP2_FIELDS[number]

const items = [
  {
    title: 'Basics',
    description: 'Set type and labels',
    icon: 'i-lucide-info',
    stage: 1
  },
  {
    title: 'Storage',
    description: 'Set capacity and layout',
    icon: 'i-lucide-grid-3x3',
    stage: 2
  },
  {
    title: 'Rules',
    description: 'Set acceptance constraints',
    icon: 'i-lucide-shield-check',
    stage: 3
  },
  {
    title: 'Review',
    description: 'Confirm and create',
    icon: 'i-lucide-check-circle',
    stage: 4
  }
]

const stepper = useTemplateRef('containerStepper')
const { showError } = useFirnToast()

const containerFormSchema = toTypedSchema(
  createContainerSchema.omit({ parentId: true })
)

const { handleSubmit, validate, errors, resetForm, values } = useForm({
  validationSchema: containerFormSchema,
  initialValues: createEmptyContainerFormValues(),
  keepValuesOnUnmount: true
})

const { value: containerTypeValue, setValue: setContainerTypeValue } = useField<CreateContainerSchemaInput['containerType']>('containerType')
const { value: classificationValue, setValue: setClassificationValue } = useField<CreateContainerSchemaInput['classification']>('classification')
const { value: rowsValue, setValue: setRowsValue } = useField<number | undefined>('rows')
const { value: columnsValue, setValue: setColumnsValue } = useField<number | undefined>('columns')
const { value: levelsValue, setValue: setLevelsValue } = useField<number | undefined>('levels')
const { value: capacityValue, setValue: setCapacityValue } = useField<number | undefined>('capacity')
const { value: acceptedItemCategoriesValue } = useField<string[]>('acceptedItemCategories')
const { value: acceptedContainerCategoriesValue } = useField<string[]>('acceptedContainerCategories')

const rowsInputValue = computed(() => rowsValue.value == null ? '' : String(rowsValue.value))
const columnsInputValue = computed(() => columnsValue.value == null ? '' : String(columnsValue.value))
const levelsInputValue = computed(() => levelsValue.value == null ? '' : String(levelsValue.value))
const capacityInputValue = computed(() => capacityValue.value == null ? '' : String(capacityValue.value))

const selectedTypeLabel = computed(() =>
  containerTypeValue.value ? CONTAINER_TYPE_LABELS[containerTypeValue.value] : '—'
)

const selectedClassificationLabel = computed(() =>
  classificationValue.value ? CONTAINER_CLASSIFICATION_LABELS[classificationValue.value] : '—'
)

const gridLabel = computed(() => {
  if (!rowsValue.value || !columnsValue.value) {
    return '—'
  }
  return `${rowsValue.value} × ${columnsValue.value}${levelsValue.value ? ` × ${levelsValue.value}` : ''}`
})

const acceptedItemsLabel = computed(() => {
  const cats = acceptedItemCategoriesValue.value
  if (!cats || cats.length === 0) return 'Any'
  return cats.map(c => ACCEPTED_ITEM_CATEGORY_OPTIONS.find(o => o.value === c)?.label ?? c).join(', ')
})

const acceptedContainersLabel = computed(() => {
  const cats = acceptedContainerCategoriesValue.value
  if (!cats || cats.length === 0) return 'Any'
  return cats.map(c => ACCEPTED_CONTAINER_CATEGORY_OPTIONS.find(o => o.value === c)?.label ?? c).join(', ')
})

function onContainerTypeUpdate(value: unknown) {
  const resolved = resolveContainerTypeFromSelect(value)
  if (resolved) {
    setContainerTypeValue(resolved)
  }
}

function onClassificationUpdate(value: unknown) {
  const resolved = resolveContainerClassificationFromSelect(value)
  if (resolved) {
    setClassificationValue(resolved)
  }
}

function onRowsUpdate(value: unknown) {
  setRowsValue(resolveNullableNumberFromInput(value))
}

function onColumnsUpdate(value: unknown) {
  setColumnsValue(resolveNullableNumberFromInput(value))
}

function onLevelsUpdate(value: unknown) {
  setLevelsValue(resolveNullableNumberFromInput(value))
}

function onCapacityUpdate(value: unknown) {
  setCapacityValue(resolveNullableNumberFromInput(value))
}

function onCapacitySlider(value: number[] | undefined) {
  const v = Array.isArray(value) ? value[0] : undefined
  setCapacityValue(v != null && v > 0 ? v : undefined)
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

async function nextFromStep2() {
  const isValid = await validateStep(STEP2_FIELDS)
  if (isValid) {
    stepper?.value?.nextStep()
  }
}

function nextFromStep3() {
  stepper?.value?.nextStep()
}

const onSubmit = handleSubmit(async (formValues) => {
  const payload = mapContainerFormValuesToCreatePayload(formValues as ContainerFormSubmitValues, props.parentId)

  try {
    const { mutateAsync } = createContainer()
    const result = await mutateAsync(payload)
    if (!result) {
      showError(`Container "${payload.name}" could not be created.`, 'Container creation error')
      return
    }

    resetForm()
    resetToFirstStep()
    emit('created')
  }
  catch (error) {
    showError(`Container "${payload.name}" could not be created: ${error}`, 'Container creation error')
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
    ref="containerStepper"
    :items="items"
  >
    <template #content="{ item }">
      <div class="h-full flex flex-col p-2 sm:p-4 mx-auto">
        <!-- Step 1: Basics -->
        <form
          v-if="item.stage === 1"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="nextFromStep1()"
        >
          <NCard
            title="Container basics"
            description="Set the container type, classification, and visible labels."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFormField
                name="containerType"
                label="Container type"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NSelect
                  :model-value="containerTypeValue"
                  :items="CONTAINER_TYPE_OPTIONS"
                  by="value"
                  @update:model-value="onContainerTypeUpdate"
                />
              </NFormField>

              <NFormField
                name="classification"
                label="Classification"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NSelect
                  :model-value="classificationValue"
                  :items="CONTAINER_CLASSIFICATION_OPTIONS"
                  by="value"
                  @update:model-value="onClassificationUpdate"
                />
              </NFormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFormField
                name="name"
                label="Name"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="e.g. Sample rack A" />
              </NFormField>

              <NFormField
                name="label"
                label="Additional label"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput placeholder="e.g. Tray 1" />
              </NFormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFormField
                name="description"
                label="Description"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput
                  type="textarea"
                  :rows="3"
                  placeholder="Optional notes"
                />
              </NFormField>

              <div class="space-y-4">
                <NFormField
                  name="isActive"
                  label="Status"
                  :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
                >
                  <NCheckbox label="Active?" />
                </NFormField>

                <NFormField
                  name="color"
                  label="Color identifier"
                  description="Visual identifier (e.g. red, blue)"
                  :una="{
                    formLabel: CONTAINER_FORM_LABEL_STYLE,
                    formDescription: 'text-muted'
                  }"
                >
                  <NInput placeholder="e.g. red" />
                </NFormField>
              </div>
            </div>
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

        <!-- Step 2: Storage layout -->
        <form
          v-else-if="item.stage === 2"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="nextFromStep2()"
        >
          <NCard
            title="Storage layout"
            description="Set optional grid dimensions and capacity."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NFormField
                name="rows"
                label="Rows"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput
                  :model-value="rowsInputValue"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="Optional"
                  @update:model-value="onRowsUpdate"
                />
              </NFormField>

              <NFormField
                name="columns"
                label="Columns"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput
                  :model-value="columnsInputValue"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="Optional"
                  @update:model-value="onColumnsUpdate"
                />
              </NFormField>

              <NFormField
                name="levels"
                label="Levels"
                :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
              >
                <NInput
                  :model-value="levelsInputValue"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="Optional"
                  @update:model-value="onLevelsUpdate"
                />
              </NFormField>
            </div>

            <div class="text-xs text-muted">
              Grid: {{ gridLabel }}
            </div>

            <NSeparator />

            <NFormField
              name="capacity"
              label="Capacity (max direct children)"
              :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
            >
              <div class="flex items-center gap-4">
                <NSlider
                  :model-value="[capacityValue ?? 0]"
                  :min="0"
                  :max="400"
                  class="flex-1"
                  @update:model-value="onCapacitySlider"
                />
                <NInput
                  :model-value="capacityInputValue"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  class="w-24"
                  @update:model-value="onCapacityUpdate"
                />
              </div>
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

        <!-- Step 3: Acceptance rules -->
        <form
          v-else-if="item.stage === 3"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="nextFromStep3()"
        >
          <NCard
            title="Acceptance rules"
            description="Restrict which item or container types can be placed inside. Leave empty to accept anything."
            card="outline-gray"
            :una="{ cardContent: 'space-y-6', cardDescription: 'text-muted' }"
          >
            <div>
              <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-3">
                Accepted item categories
              </p>
              <p class="text-xs text-muted mb-3">
                Select which item types this container can hold. None selected means any item is accepted.
              </p>
              <InputAcceptanceCategoryToggle
                v-model="acceptedItemCategoriesValue"
                :options="ACCEPTED_ITEM_CATEGORY_OPTIONS"
              />
            </div>

            <NSeparator />

            <div>
              <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-3">
                Accepted container types
              </p>
              <p class="text-xs text-muted mb-3">
                Select which nested container types this container can hold. None selected means any container is accepted.
              </p>
              <InputAcceptanceCategoryToggle
                v-model="acceptedContainerCategoriesValue"
                :options="ACCEPTED_CONTAINER_CATEGORY_OPTIONS"
              />
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
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <!-- Step 4: Review -->
        <form
          v-else
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="onValidatingSubmit()"
        >
          <NCard
            title="Review"
            description="Confirm the most important values before creating the container."
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
                  Classification
                </p>
                <p class="font-medium">
                  {{ selectedClassificationLabel }}
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
                  Grid
                </p>
                <p class="font-medium">
                  {{ gridLabel }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Capacity
                </p>
                <p class="font-medium">
                  {{ values.capacity == null ? '—' : values.capacity }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Accepted items
                </p>
                <p class="font-medium">
                  {{ acceptedItemsLabel }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Accepted containers
                </p>
                <p class="font-medium">
                  {{ acceptedContainersLabel }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium mb-0.5">
                  Color
                </p>
                <p class="font-medium">
                  {{ values.color || '—' }}
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
              label="Create container"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-box"
            />
          </div>
        </form>
      </div>
    </template>
  </NStepper>
</template>
