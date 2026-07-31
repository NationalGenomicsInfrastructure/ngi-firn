<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useQuery as useQueryColada } from '@pinia/colada'
import { createContainerSchema } from '~~/schemas/inventory/container'
import type { ContainerParentKindType, ContainerCapacity, ContainerType } from '~~/schemas/inventory/container'
import { createContainer } from '~/utils/mutations/inventory/containers'
import { acceptedChildrenQuery } from '~/utils/queries/inventory/containers'
import {
  CONTAINER_TYPE_LABELS,
  resolveContainerTypeFromSelect,
  EQUIPMENT_FORM_LABEL_STYLE
} from '~/utils/inventory/equipment'
import type { SelectOption } from '~/utils/inventory/equipment'
import {
  CONTAINER_CLASSIFICATION_OPTIONS,
  resolveClassificationFromSelect,
  capacityMode
} from '~/utils/inventory/container'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{
  parentSlug: string
  parentKind: ContainerParentKindType
}>()

const emit = defineEmits<{
  created: []
}>()

const STEP1_FIELDS = ['containerType', 'classification', 'name'] as const
type StepField = typeof STEP1_FIELDS[number]

const items = [
  {
    title: 'Basics',
    description: 'Set type and labels',
    icon: 'i-lucide-info',
    stage: 1
  },
  {
    title: 'Capacity',
    description: 'Declare what it holds',
    icon: 'i-lucide-layers',
    stage: 2
  },
  {
    title: 'Review',
    description: 'Confirm and create',
    icon: 'i-lucide-clipboard-check',
    stage: 3
  }
]

const stepper = useTemplateRef('containerStepper')
const { mutateAsync: createContainerAsync } = createContainer()

const containerFormSchema = toTypedSchema(
  createContainerSchema.omit({
    parentSlug: true,
    parentKind: true,
    position: true,
    templateId: true,
    projectIds: true
  })
)

const { handleSubmit, validate, errors, resetForm, values } = useForm({
  validationSchema: containerFormSchema,
  initialValues: {
    containerType: 'Box' as const,
    classification: 'Sample' as const,
    name: '',
    label: '',
    description: '',
    capacity: [] as ContainerCapacity[]
  },
  keepValuesOnUnmount: true
})

const { value: containerTypeValue, setValue: setContainerTypeValue } = useField<string>('containerType')
const { value: classificationValue, setValue: setClassificationValue } = useField<string>('classification')
const { value: capacityValue, setValue: setCapacityValue } = useField<ContainerCapacity[]>('capacity')

// What container types the parent accepts, with remaining free-slot counts. The
// authoritative capacity check still runs on create; this gates the select up-front.
const {
  state: acceptedState,
  asyncStatus: acceptedStatus
} = useQueryColada(() => acceptedChildrenQuery({ parentSlug: props.parentSlug, parentKind: props.parentKind }))

const isLoadingAcceptance = computed(() => acceptedStatus.value === 'loading' && acceptedState.value.status !== 'success')
const isAcceptanceError = computed(() => acceptedState.value.status === 'error')
const acceptanceErrorMessage = computed(() => {
  if (acceptedState.value.status !== 'error') return undefined
  const message = acceptedState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while checking what this parent accepts.'
})

// Only container-kind entries matter — the stepper creates containers, not items.
const acceptedContainerTypes = computed(() =>
  (acceptedState.value.status === 'success' ? acceptedState.value.data : [])
    .filter(entry => entry.childKind === 'container')
)

const freeByType = computed(() => {
  const map = new Map<string, number>()
  for (const entry of acceptedContainerTypes.value) {
    map.set(entry.type, entry.free)
  }
  return map
})

// Types with at least one free slot — selectable and shown in the summary line.
const availableTypes = computed(() =>
  acceptedContainerTypes.value.filter(entry => entry.free > 0)
)

// Every accepted type as a select option, annotated with remaining slots. Full types
// (0 left) stay visible but greyed and are blocked from selection.
const typeSelectOptions = computed<SelectOption<ContainerType>[]>(() =>
  acceptedContainerTypes.value.map((entry) => {
    const type = entry.type as ContainerType
    return {
      value: type,
      label: `${CONTAINER_TYPE_LABELS[type]} (${entry.free} left)`
    }
  })
)

function isTypeFull(type: string): boolean {
  return (freeByType.value.get(type) ?? 0) <= 0
}

// Human-readable "you can still add Box (4), Bag (3)" line for the basics step.
const acceptanceSummary = computed(() =>
  availableTypes.value
    .map(entry => `${CONTAINER_TYPE_LABELS[entry.type as ContainerType]} (${entry.free})`)
    .join(', ')
)

// Block the whole flow when the parent accepts no container types or all are full.
const acceptanceBlocked = computed(() =>
  !isLoadingAcceptance.value && !isAcceptanceError.value && availableTypes.value.length === 0
)

// Keep the selected type on an accepted, non-full option (initial 'Box' may not apply).
watch(availableTypes, (types) => {
  if (types.length === 0) return
  const current = containerTypeValue.value
  const currentOk = current != null && types.some(entry => entry.type === current)
  if (!currentOk) {
    setContainerTypeValue(types[0]!.type as ContainerType)
  }
}, { immediate: true })

const selectedTypeLabel = computed(() =>
  containerTypeValue.value ? CONTAINER_TYPE_LABELS[containerTypeValue.value as keyof typeof CONTAINER_TYPE_LABELS] : '—'
)

const capacitySummary = computed(() => {
  const mode = capacityMode(values.capacity)
  if (mode === 'none') return 'No capacity limit'
  if (mode === 'grid') {
    const g = values.capacity?.[0]
    if (g && g.layout === 'grid') {
      const levels = g.levels ?? 1
      return `Grid ${g.rows} × ${g.columns}${levels > 1 ? ` × ${levels}` : ''}`
    }
    return 'Grid layout'
  }
  const n = values.capacity?.length ?? 0
  return `${n} count cap${n === 1 ? '' : 's'}`
})

function onContainerTypeUpdate(value: unknown) {
  const resolved = resolveContainerTypeFromSelect(value)
  // Full types (0 left) are shown greyed but must not be selectable.
  if (resolved && !isTypeFull(resolved)) {
    setContainerTypeValue(resolved)
  }
}

function onClassificationUpdate(value: unknown) {
  const resolved = resolveClassificationFromSelect(value)
  if (resolved) {
    setClassificationValue(resolved)
  }
}

function resetToFirstStep() {
  // Jump directly instead of looping prevStep(): inside a synchronous loop the
  // component cannot re-render, so reka-ui's StepperRoot keeps computing from a
  // stale modelValue prop and re-emits the old index, making hasPrev() never
  // turn false (infinite loop that freezes the tab on steppers with 3+ steps).
  stepper?.value?.goToStep(0)
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
  // The createContainer mutation toasts and navigates to the new container on
  // success and toasts on error; we only reset local state and notify the parent.
  const result = await createContainerAsync({
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
      title="Checking capacity..."
      description="Determining which container types this parent still accepts."
      icon="i-lucide-loader-2"
    />

    <NAlert
      v-else-if="isAcceptanceError"
      alert="border-error"
      title="Could not check capacity"
      :description="acceptanceErrorMessage"
      icon="i-lucide-alert-circle"
    />

    <NAlert
      v-else-if="acceptanceBlocked"
      alert="border-warning"
      title="No free capacity"
      description="This parent does not accept any more containers — every accepted type is full or none is configured. Free a slot or adjust the parent's capacity before adding a container."
      icon="i-lucide-package-x"
    />

    <NStepper
      v-else
      ref="containerStepper"
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
              title="Container basics"
              description="Set the type, classification and visible labels."
              card="outline-gray"
              :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NFormField
                  name="containerType"
                  label="Container type"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NSelect
                    :model-value="containerTypeValue"
                    :items="typeSelectOptions"
                    by="value"
                    @update:model-value="onContainerTypeUpdate"
                  >
                    <template #item="{ item: option }">
                      <span :class="isTypeFull(option.value) ? 'opacity-40' : ''">
                        {{ option.label }}
                      </span>
                    </template>
                  </NSelect>
                </NFormField>
                <NFormField
                  name="classification"
                  label="Classification"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NSelect
                    :model-value="classificationValue"
                    :items="CONTAINER_CLASSIFICATION_OPTIONS"
                    by="value"
                    @update:model-value="onClassificationUpdate"
                  />
                </NFormField>
              </div>

              <p
                v-if="acceptanceSummary"
                class="text-xs text-muted flex items-center gap-1.5"
              >
                <NIcon
                  name="i-lucide-package-check"
                  class="text-primary-400 dark:text-primary-600"
                />
                <span>You can still add: {{ acceptanceSummary }}</span>
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NFormField
                  name="name"
                  label="Name"
                  :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
                >
                  <NInput placeholder="e.g. Rack A1" />
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
              title="Container capacity"
              description="Declare what this container holds — a simple count per category, or a positional grid."
              card="outline-gray"
              :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
            >
              <FormFieldContainerCapacity
                :model-value="capacityValue"
                @update:model-value="setCapacityValue"
              />
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
                    {{ values.classification || '—' }}
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
                    Capacity
                  </p>
                  <p class="font-medium">
                    {{ capacitySummary }}
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
                trailing="i-lucide-package-plus"
              />
            </div>
          </form>
        </div>
      </template>
    </NStepper>
  </div>
</template>
