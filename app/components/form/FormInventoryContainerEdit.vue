<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { updateContainerSchema } from '~~/schemas/inventory/container'
import type { ContainerCapacity, ContainerClassification } from '~~/schemas/inventory/container'
import type { DisplayContainer } from '~~/types/inventory'
import { updateContainer } from '~/utils/mutations/inventory/containers'
import {
  CONTAINER_TYPE_LABELS,
  EQUIPMENT_FORM_LABEL_STYLE
} from '~/utils/inventory/equipment'
import {
  CONTAINER_CLASSIFICATION_OPTIONS,
  resolveClassificationFromSelect,
  containerCapacityEntriesToForm
} from '~/utils/inventory/container'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{
  container: DisplayContainer
  hideSubmit?: boolean
  formId?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const formElementId = computed(() => props.formId ?? `inventory-container-edit-${props.container.slug}`)

const containerTypeLabel = computed(() =>
  CONTAINER_TYPE_LABELS[props.container.containerType]
)

const { mutateAsync: updateContainerAsync } = updateContainer()

// containerType is intentionally omitted — it is read-only here
const containerFormSchema = toTypedSchema(
  updateContainerSchema.omit({ position: true, containerType: true })
)

const { handleSubmit, validate, errors, setFieldValue } = useForm({
  validationSchema: containerFormSchema,
  initialValues: {
    containerSlug: props.container.slug,
    classification: props.container.classification ?? undefined,
    name: props.container.name,
    label: props.container.label ?? '',
    description: props.container.description ?? '',
    temperatureCelsius: props.container.temperatureCelsius ?? undefined,
    capacity: containerCapacityEntriesToForm(props.container.capacity),
    logComment: ''
  }
})

const { value: classificationValue, setValue: setClassificationValue } = useField<ContainerClassification | undefined>('classification')
const { value: capacityValue, setValue: setCapacityValue } = useField<ContainerCapacity[]>('capacity')
const { value: temperatureValue } = useField<number | undefined>('temperatureCelsius')

function onClassificationUpdate(value: unknown) {
  const resolved = resolveClassificationFromSelect(value)
  setClassificationValue(resolved ?? undefined)
}

function onTemperatureUpdate(value: unknown) {
  const parsed = value === '' || value == null ? undefined : Number(value)
  setFieldValue('temperatureCelsius', Number.isFinite(parsed) ? parsed : undefined)
}

const onSubmit = handleSubmit(async (values) => {
  // The updateContainer mutation toasts on success/error and syncs the cache; we only
  // notify the parent so it can close the drawer.
  const result = await updateContainerAsync(values)
  if (result) {
    emit('saved')
  }
})

async function onValidating() {
  await validate()
  await focusFirstFormFieldError(errors.value)
  onSubmit()
}
</script>

<template>
  <form
    :id="formElementId"
    class="mx-auto max-w-4xl p-4 space-y-4"
    @submit.prevent="onValidating()"
  >
    <div class="flex flex-col xl:flex-row gap-8">
      <div class="flex-1 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span :class="EQUIPMENT_FORM_LABEL_STYLE">Container type</span>
            <div class="mt-1 flex items-center gap-2">
              <p class="font-medium">
                {{ containerTypeLabel }}
              </p>
              <NBadge
                label="Fixed"
                badge="outline"
                size="xs"
              />
            </div>
          </div>

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
            :una="{
              formLabel: EQUIPMENT_FORM_LABEL_STYLE,
              formDescription: 'text-muted'
            }"
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
        <NFormField
          name="temperatureCelsius"
          label="Temperature (°C)"
          :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="temperatureValue ?? ''"
            type="number"
            step="0.1"
            placeholder="Optional"
            @update:model-value="onTemperatureUpdate"
          />
        </NFormField>
      </div>

      <NSeparator class="xl:hidden" />
      <NSeparator
        orientation="vertical"
        class="hidden xl:block !h-auto self-stretch"
      />

      <div class="flex-1 space-y-4">
        <div>
          <div class="flex items-center gap-2 mb-3">
            <NIcon
              name="i-lucide-layers"
              class="text-muted"
            />
            <h4 class="text-sm font-semibold">
              Container capacity
            </h4>
          </div>
          <FormFieldContainerCapacity
            :model-value="capacityValue"
            @update:model-value="setCapacityValue"
          />
        </div>

        <NSeparator />

        <NFormField
          name="logComment"
          label="Reason for change"
          :una="{
            formLabel: EQUIPMENT_FORM_LABEL_STYLE,
            formDescription: 'text-muted'
          }"
        >
          <NInput
            type="textarea"
            :rows="2"
            placeholder="Optional — appended to this container's action log"
          />
        </NFormField>
      </div>
    </div>

    <NButton
      v-if="!hideSubmit"
      type="submit"
      btn="soft-success hover:outline-success"
      leading="i-lucide-pencil"
      class="w-full"
    >
      Save container
    </NButton>
  </form>
</template>
