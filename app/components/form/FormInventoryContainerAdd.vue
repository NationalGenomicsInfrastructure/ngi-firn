<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import type { CreateContainerSchemaInput } from '~~/schemas/inventory-containers'
import { createContainerSchema } from '~~/schemas/inventory-containers'
import { createContainer } from '~/utils/mutations/inventory/containers'
import {
  CONTAINER_CLASSIFICATION_OPTIONS,
  CONTAINER_FORM_LABEL_STYLE,
  CONTAINER_TYPE_OPTIONS,
  createEmptyContainerFormValues,
  mapContainerFormValuesToCreatePayload,
  resolveContainerClassificationFromSelect,
  resolveContainerTypeFromSelect,
  resolveNullableNumberFromInput
} from '~/utils/inventory/containers'

const props = defineProps<{
  parentId: string
}>()

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

const formSchema = toTypedSchema(createContainerSchema)

const { handleSubmit, validate, errors, resetForm } = useForm({
  validationSchema: formSchema,
  initialValues: createEmptyContainerFormValues()
})

const { value: containerTypeValue, setValue: setContainerTypeValue } = useField<CreateContainerSchemaInput['containerType']>('containerType')
const { value: classificationValue, setValue: setClassificationValue } = useField<CreateContainerSchemaInput['classification']>('classification')
const { value: rowsValue, setValue: setRowsValue } = useField<number | undefined>('rows')
const { value: columnsValue, setValue: setColumnsValue } = useField<number | undefined>('columns')
const { value: levelsValue, setValue: setLevelsValue } = useField<number | undefined>('levels')
const { value: capacityValue, setValue: setCapacityValue } = useField<number | undefined>('capacity')

const rowsInputValue = computed(() => rowsValue.value == null ? '' : String(rowsValue.value))
const columnsInputValue = computed(() => columnsValue.value == null ? '' : String(columnsValue.value))
const levelsInputValue = computed(() => levelsValue.value == null ? '' : String(levelsValue.value))
const capacityInputValue = computed(() => capacityValue.value == null ? '' : String(capacityValue.value))

const gridLabel = computed(() => {
  if (!rowsValue.value || !columnsValue.value) {
    return '—'
  }
  return `${rowsValue.value} × ${columnsValue.value}${levelsValue.value ? ` × ${levelsValue.value}` : ''}`
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

const onSubmit = handleSubmit(async (values) => {
  const payload = mapContainerFormValuesToCreatePayload(values, props.parentId)

  try {
    const { mutateAsync } = createContainer()
    const result = await mutateAsync(payload)
    if (result) {
      resetForm()
    }
    else {
      showError(`Container "${payload.name}" could not be created.`, 'Container creation error', { actions: toastActions })
    }
  }
  catch (error) {
    showError(`Container "${payload.name}" could not be created: ${error}`, 'Container creation error', { actions: toastActions })
  }
})

async function onValidating() {
  await validate()
  onSubmit()
}
</script>

<template>
  <form
    class="mx-auto max-w-2xl p-4 space-y-4"
    @submit.prevent="onValidating()"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="name"
        label="Container name"
        :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Sample rack A" />
      </NFormField>
      <NFormField
        name="label"
        label="Custom label"
        :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Tray 1" />
      </NFormField>
    </div>

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

    <NFormField
      name="description"
      label="Description"
      :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
    >
      <NInput
        type="textarea"
        :rows="3"
        placeholder="Optional container notes"
      />
    </NFormField>

    <div class="border-t pt-4">
      <h3 class="text-sm font-semibold mb-4 text-primary-700 dark:text-primary-300">
        Storage layout (optional)
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            placeholder="e.g. 8"
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
            placeholder="e.g. 12"
            @update:model-value="onColumnsUpdate"
          />
        </NFormField>

        <NFormField
          name="levels"
          label="Levels"
          description="Optional depth/height dimension"
          :una="{
            formLabel: CONTAINER_FORM_LABEL_STYLE,
            formDescription: 'text-muted'
          }"
        >
          <NInput
            :model-value="levelsInputValue"
            type="number"
            step="1"
            min="1"
            placeholder="e.g. 2"
            @update:model-value="onLevelsUpdate"
          />
        </NFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NFormField
          name="capacity"
          label="Total capacity"
          description="Max number of items/containers"
          :una="{
            formLabel: CONTAINER_FORM_LABEL_STYLE,
            formDescription: 'text-muted'
          }"
        >
          <NInput
            :model-value="capacityInputValue"
            type="number"
            step="1"
            min="1"
            placeholder="e.g. 96"
            @update:model-value="onCapacityUpdate"
          />
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

      <div class="text-xs text-muted mt-2">
        Current grid: {{ gridLabel }}
      </div>
    </div>

    <div class="flex gap-3 items-end justify-between pt-4 border-t">
      <NFormField
        name="isActive"
        label="Status"
        :una="{ formLabel: CONTAINER_FORM_LABEL_STYLE }"
      >
        <NCheckbox label="Active?" />
      </NFormField>

      <NButton
        type="submit"
        btn="soft-success hover:outline-success"
        leading="i-lucide-plus"
      >
        Create container
      </NButton>
    </div>
  </form>
</template>
