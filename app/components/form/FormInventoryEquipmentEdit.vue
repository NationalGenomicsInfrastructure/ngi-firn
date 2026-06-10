<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { updateEquipmentSchema } from '~~/schemas/inventory-locations'
import type { StorageEquipment } from '~~/types/inventory'
import { updateEquipment } from '~/utils/mutations/inventory/rooms'
import {
  createEquipmentFormValuesFromEquipment,
  EQUIPMENT_FORM_LABEL_STYLE,
  EQUIPMENT_TYPE_OPTIONS,
  mapEquipmentFormValuesToUpdatePayload,
  resolveEquipmentTypeFromSelect,
  resolveNullableNumberFromInput,
  type EquipmentFormSubmitValues
} from '~/utils/inventory/equipment'
import { focusFirstFormFieldError } from '~/utils/inventory/rooms'

const props = defineProps<{
  equipment: StorageEquipment
  roomDocumentId: string
  hideSubmit?: boolean
  formId?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const formElementId = computed(() => props.formId ?? `inventory-equipment-edit-${props.equipment._id}`)

const { showError } = useFirnToast()

const equipmentFormSchema = toTypedSchema(
  updateEquipmentSchema.omit({
    id: true,
    rev: true
  })
)

const { handleSubmit, validate, errors } = useForm({
  validationSchema: equipmentFormSchema,
  initialValues: createEquipmentFormValuesFromEquipment(props.equipment)
})

const { value: equipmentTypeValue, setValue: setEquipmentTypeValue } = useField<'cabinet' | 'freezer' | 'fridge' | 'shelf' | 'nitrogenTank' | 'other'>('equipmentType')
const { value: rowsValue, setValue: setRowsValue } = useField<number | undefined>('rows')
const { value: columnsValue, setValue: setColumnsValue } = useField<number | undefined>('columns')
const { value: levelsValue, setValue: setLevelsValue } = useField<number | undefined>('levels')
const { value: temperatureValue, setValue: setTemperatureValue } = useField<number | undefined>('temperatureCelsius')
const { value: capacityValue, setValue: setCapacityValue } = useField<number | undefined>('capacity')

const rowsInputValue = computed(() => rowsValue.value == null ? '' : String(rowsValue.value))
const columnsInputValue = computed(() => columnsValue.value == null ? '' : String(columnsValue.value))
const levelsInputValue = computed(() => levelsValue.value == null ? '' : String(levelsValue.value))
const temperatureInputValue = computed(() => temperatureValue.value == null ? '' : String(temperatureValue.value))
const capacityInputValue = computed(() => capacityValue.value == null ? '' : String(capacityValue.value))

function onEquipmentTypeUpdate(value: unknown) {
  const resolved = resolveEquipmentTypeFromSelect(value)
  if (resolved) {
    setEquipmentTypeValue(resolved)
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

function onTemperatureUpdate(value: unknown) {
  setTemperatureValue(resolveNullableNumberFromInput(value))
}

function onCapacityUpdate(value: unknown) {
  setCapacityValue(resolveNullableNumberFromInput(value))
}

const onSubmit = handleSubmit(async (values) => {
  const payload = mapEquipmentFormValuesToUpdatePayload(props.equipment, values as EquipmentFormSubmitValues)

  try {
    const { mutateAsync } = updateEquipment()
    const result = await mutateAsync({
      ...payload,
      roomDocumentId: props.roomDocumentId
    })
    if (!result) {
      showError(`Equipment "${payload.name}" could not be updated.`, 'Equipment update error')
      return
    }

    emit('saved')
  }
  catch (error) {
    showError(`Equipment "${payload.name}" could not be updated: ${error}`, 'Equipment update error')
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
    class="mx-auto max-w-2xl p-4 space-y-4"
    @submit.prevent="onValidating()"
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
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="name"
        label="Name"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Main -80 freezer" />
      </NFormField>

      <NFormField
        name="label"
        label="Label"
        description="Short visible label shown in lists (optional)."
        :una="{
          formLabel: EQUIPMENT_FORM_LABEL_STYLE,
          formDescription: 'text-muted'
        }"
      >
        <NInput placeholder="e.g. -80 #2" />
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

    <NSeparator class="my-4" />

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <NFormField
        name="rows"
        label="Rows"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
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
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
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
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
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

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        name="capacity"
        label="Capacity"
        description="Maximum direct children."
        :una="{
          formLabel: EQUIPMENT_FORM_LABEL_STYLE,
          formDescription: 'text-muted'
        }"
      >
        <NInput
          :model-value="capacityInputValue"
          type="number"
          step="1"
          min="1"
          placeholder="Optional"
          @update:model-value="onCapacityUpdate"
        />
      </NFormField>
    </div>

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

    <NFormField
      name="isActive"
      label="Status"
      :una="{
        formLabel: EQUIPMENT_FORM_LABEL_STYLE,
        formDescription: 'text-muted'
      }"
    >
      <NCheckbox label="Active?" />
    </NFormField>

    <NButton
      v-if="!hideSubmit"
      type="submit"
      btn="soft-success hover:outline-success"
      leading="i-lucide-pencil"
      class="w-full"
    >
      Save equipment
    </NButton>
  </form>
</template>
