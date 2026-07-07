<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { updateEquipmentSchema } from '~~/schemas/inventory/equipment'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { updateEquipment } from '~/utils/mutations/inventory/equipment'
import {
  EQUIPMENT_FORM_LABEL_STYLE,
  EQUIPMENT_TYPE_OPTIONS,
  displayCapacityToFormCapacity,
  resolveEquipmentTypeFromSelect,
  resolveNullableNumberFromInput,
  type CapacityRow
} from '~/utils/inventory/equipment'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{
  equipment: DisplayStorageEquipment
  roomSlug: string
  hideSubmit?: boolean
  formId?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const formElementId = computed(() => props.formId ?? `inventory-equipment-edit-${props.equipment.slug}`)

const { showError } = useFirnToast()
const { mutateAsync: updateEquipmentAsync } = updateEquipment()

const equipmentFormSchema = toTypedSchema(
  updateEquipmentSchema.omit({ temperatureSensorId: true })
)

const { handleSubmit, validate, errors } = useForm({
  validationSchema: equipmentFormSchema,
  initialValues: {
    equipmentSlug: props.equipment.slug,
    equipmentType: props.equipment.equipmentType,
    name: props.equipment.name,
    label: props.equipment.label ?? '',
    description: props.equipment.description ?? '',
    capacity: displayCapacityToFormCapacity(props.equipment.capacity),
    temperatureCelsius: props.equipment.temperatureCelsius ?? undefined,
    manufacturer: props.equipment.manufacturer ?? '',
    model: props.equipment.model ?? '',
    serialNumber: props.equipment.serialNumber ?? '',
    isActive: props.equipment.isActive
  }
})

const { value: equipmentTypeValue, setValue: setEquipmentTypeValue } = useField<string>('equipmentType')
const { value: temperatureValue, setValue: setTemperatureValue } = useField<number | undefined>('temperatureCelsius')
const { value: capacityValue, setValue: setCapacityValue } = useField<CapacityRow[]>('capacity')

const temperatureInputValue = computed(() => temperatureValue.value == null ? '' : String(temperatureValue.value))

function onEquipmentTypeUpdate(value: unknown) {
  const resolved = resolveEquipmentTypeFromSelect(value)
  if (resolved) {
    setEquipmentTypeValue(resolved)
  }
}

function onTemperatureUpdate(value: unknown) {
  setTemperatureValue(resolveNullableNumberFromInput(value))
}

const onSubmit = handleSubmit(async (values) => {
  try {
    const result = await updateEquipmentAsync(values)
    if (!result) {
      showError(`Equipment "${values.name}" could not be updated.`, 'Equipment update error')
      return
    }

    emit('saved')
  }
  catch (error) {
    showError(`Equipment "${values.name}" could not be updated: ${error}`, 'Equipment update error')
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
      <FormFieldEquipmentCapacity
        :model-value="capacityValue"
        @update:model-value="setCapacityValue"
      />
    </div>

    <NSeparator class="my-4" />

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
