<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import type { DisplayInventoryItem } from '~~/types/inventory'
import { updateItemSchema } from '~~/schemas/inventory/items'
import type { InventoryClassificationType } from '~~/schemas/inventory/metadata'
import { updateItem } from '~/utils/mutations/inventory/items'
import { EQUIPMENT_FORM_LABEL_STYLE } from '~/utils/inventory/equipment'
import { focusFirstFormFieldError } from '~/utils/inventory/room'

const props = defineProps<{ item: DisplayInventoryItem, hideSubmit?: boolean, formId?: string }>()
const emit = defineEmits<{ saved: [] }>()
const formElementId = computed(() => props.formId ?? `inventory-item-edit-${props.item.slug}`)
const { mutateAsync: updateItemAsync } = updateItem()

const { handleSubmit, validate, errors, setFieldValue } = useForm({
  validationSchema: toTypedSchema(updateItemSchema),
  initialValues: {
    itemSlug: props.item.slug,
    classification: props.item.classification ?? undefined,
    name: props.item.name,
    label: props.item.label ?? '',
    description: props.item.description ?? '',
    quantity: props.item.quantity ?? undefined,
    unit: props.item.unit ?? '',
    concentration: props.item.concentration ?? undefined,
    concentrationUnit: props.item.concentrationUnit ?? '',
    temperatureCelsius: props.item.temperatureCelsius ?? undefined,
    arrivalDate: props.item.arrivalDate ?? '',
    openingDate: props.item.openingDate ?? '',
    expiryDate: props.item.expiryDate ?? '',
    lotNumber: props.item.lotNumber ?? '',
    barcode: props.item.barcode ?? '',
    templateId: props.item.templateId ?? '',
    notes: props.item.notes ?? '',
    metadata: props.item.metadata ?? undefined,
    logComment: ''
  }
})
const { value: quantityValue } = useField<number | undefined>('quantity')
const { value: concentrationValue } = useField<number | undefined>('concentration')
const { value: temperatureValue } = useField<number | undefined>('temperatureCelsius')
const { value: classificationValue, setValue: setClassificationValue } = useField<InventoryClassificationType | undefined>('classification')

const classificationOptions = [
  'Sample',
  'Reagent',
  'Control',
  'Library',
  'Consumable',
  'Equipment',
  'Other'
].map(value => ({ value, label: value }))

function setClassification(value: unknown) {
  const selected = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : undefined
  if (typeof selected === 'string' && classificationOptions.some(option => option.value === selected)) {
    setClassificationValue(selected as InventoryClassificationType)
  }
}

function setOptionalNumber(field: 'quantity' | 'concentration' | 'temperatureCelsius', value: unknown) {
  const parsed = value === '' || value == null ? undefined : Number(value)
  setFieldValue(field, Number.isFinite(parsed) ? parsed : undefined)
}

const onSubmit = handleSubmit(async (values) => {
  const result = await updateItemAsync(values)
  if (result) emit('saved')
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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="name"
        label="Name"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NInput />
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
          @update:model-value="setOptionalNumber('temperatureCelsius', $event)"
        />
      </NFormField>
      <NFormField
        name="classification"
        label="Classification"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="classificationValue"
          :items="classificationOptions"
          by="value"
          @update:model-value="setClassification"
        />
      </NFormField>
      <NFormField
        name="label"
        label="Additional label"
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
    <NFormField
      name="description"
      label="Description"
      :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
    >
      <NInput
        type="textarea"
        :rows="3"
        placeholder="Optional description"
      />
    </NFormField>
    <NSeparator class="my-4" />
    <div class="flex items-center gap-2">
      <NIcon
        name="i-lucide-flask-conical"
        class="text-muted"
      /><h4 class="text-sm font-semibold">
        Stock details
      </h4>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="quantity"
        label="Quantity"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NInput
          :model-value="quantityValue ?? ''"
          type="number"
          min="0"
          step="any"
          @update:model-value="setOptionalNumber('quantity', $event)"
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
          :model-value="concentrationValue ?? ''"
          type="number"
          min="0"
          step="any"
          @update:model-value="setOptionalNumber('concentration', $event)"
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
        name="lotNumber"
        label="Lot number"
        :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="Optional" />
      </NFormField>
      <NFormField
        name="templateId"
        label="Template"
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
        placeholder="Optional handling notes"
      />
    </NFormField>
    <NFormField
      name="logComment"
      label="Reason for change"
      :una="{ formLabel: EQUIPMENT_FORM_LABEL_STYLE, formDescription: 'text-muted' }"
    >
      <NInput
        type="textarea"
        :rows="2"
        placeholder="Optional — appended to the action log"
      />
    </NFormField>
    <NButton
      v-if="!hideSubmit"
      type="submit"
      btn="soft-success hover:outline-success"
      leading="i-lucide-pencil"
      class="w-full"
    >
      Save item
    </NButton>
  </form>
</template>
