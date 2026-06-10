<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import type { InventoryItem } from '~~/types/inventory'
import { createItemSchema } from '~~/schemas/inventory-items'
import { createItem } from '~/utils/mutations/inventory/items'
import {
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_OPTIONS,
  ITEM_CLASSIFICATION_OPTIONS,
  ITEM_FORM_LABEL_STYLE,
  ITEM_STATUS_OPTIONS,
  createEmptyItemFormValues,
  mapItemFormValuesToCreatePayload,
  resolveItemCategoryFromSelect,
  resolveItemClassificationFromSelect,
  resolveItemStatusFromSelect,
  resolveNullableNumberFromInput,
  type ItemFormSubmitValues
} from '~/utils/inventory/items'

const props = defineProps<{
  parentId: string
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const { showError } = useFirnToast()

const formSchema = toTypedSchema(
  createItemSchema.omit({ parentId: true })
)

const { handleSubmit, validate, resetForm } = useForm({
  validationSchema: formSchema,
  initialValues: createEmptyItemFormValues()
})

const { value: categoryValue, setValue: setCategoryValue } = useField<InventoryItem['category']>('category')
const { value: classificationValue, setValue: setClassificationValue } = useField<InventoryItem['classification']>('classification')
const { value: statusValue, setValue: setStatusValue } = useField<InventoryItem['status']>('status')
const { value: quantityValue, setValue: setQuantityValue } = useField<number | undefined>('quantity')
const { value: concentrationValue, setValue: setConcentrationValue } = useField<number | undefined>('concentration')

const quantityInputValue = computed(() => quantityValue.value == null ? '' : String(quantityValue.value))
const concentrationInputValue = computed(() => concentrationValue.value == null ? '' : String(concentrationValue.value))

const categoryLabel = computed(() => ITEM_CATEGORY_LABELS[categoryValue.value] ?? categoryValue.value)

function onCategoryUpdate(value: unknown) {
  const resolved = resolveItemCategoryFromSelect(value)
  if (resolved) {
    setCategoryValue(resolved)
  }
}

function onClassificationUpdate(value: unknown) {
  const resolved = resolveItemClassificationFromSelect(value)
  if (resolved) {
    setClassificationValue(resolved)
  }
}

function onStatusUpdate(value: unknown) {
  const resolved = resolveItemStatusFromSelect(value)
  if (resolved) {
    setStatusValue(resolved)
  }
}

function onQuantityUpdate(value: unknown) {
  setQuantityValue(resolveNullableNumberFromInput(value))
}

function onConcentrationUpdate(value: unknown) {
  setConcentrationValue(resolveNullableNumberFromInput(value))
}

const onSubmit = handleSubmit(async (values) => {
  const payload = mapItemFormValuesToCreatePayload(values as ItemFormSubmitValues, props.parentId)

  try {
    const { mutateAsync } = createItem()
    const result = await mutateAsync(payload)
    if (result) {
      resetForm()
      emit('success')
      emit('close')
    }
    else {
      showError(`Item "${payload.name}" could not be created.`, 'Item creation error')
    }
  }
  catch (error) {
    showError(`Item "${payload.name}" could not be created: ${error}`, 'Item creation error')
  }
})

async function onValidating() {
  await validate()
  onSubmit()
}
</script>

<template>
  <form
    class="space-y-4"
    @submit.prevent="onValidating()"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="name"
        label="Item name"
        :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Sample 001" />
      </NFormField>
      <NFormField
        name="label"
        label="Custom label"
        :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Control" />
      </NFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <NFormField
        name="category"
        label="Category"
        :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="categoryValue"
          :items="ITEM_CATEGORY_OPTIONS"
          by="value"
          @update:model-value="onCategoryUpdate"
        />
      </NFormField>

      <NFormField
        name="classification"
        label="Classification"
        :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="classificationValue"
          :items="ITEM_CLASSIFICATION_OPTIONS"
          by="value"
          @update:model-value="onClassificationUpdate"
        />
      </NFormField>

      <NFormField
        name="status"
        label="Status"
        :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="statusValue"
          :items="ITEM_STATUS_OPTIONS"
          by="value"
          @update:model-value="onStatusUpdate"
        />
      </NFormField>
    </div>

    <NFormField
      name="notes"
      label="Notes"
      :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
    >
      <NInput
        type="textarea"
        :rows="2"
        placeholder="Optional notes or comments"
      />
    </NFormField>

    <div class="border-t pt-4">
      <h3 class="text-sm font-semibold mb-4 text-primary-700 dark:text-primary-300">
        Quantity & Concentration (optional)
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NFormField
          name="quantity"
          label="Quantity"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="quantityInputValue"
            type="number"
            step="0.1"
            placeholder="e.g. 100"
            @update:model-value="onQuantityUpdate"
          />
        </NFormField>

        <NFormField
          name="unit"
          label="Unit"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput placeholder="e.g. µL, µg, cells" />
        </NFormField>

        <NFormField
          name="concentration"
          label="Concentration"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="concentrationInputValue"
            type="number"
            step="0.1"
            placeholder="e.g. 50"
            @update:model-value="onConcentrationUpdate"
          />
        </NFormField>

        <NFormField
          name="concentrationUnit"
          label="Concentration unit"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput placeholder="e.g. ng/µL, mM" />
        </NFormField>
      </div>
    </div>

    <div class="border-t pt-4">
      <h3 class="text-sm font-semibold mb-4 text-primary-700 dark:text-primary-300">
        Tracking (optional)
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NFormField
          name="expiryDate"
          label="Expiry date"
          description="ISO format (YYYY-MM-DD)"
          :una="{
            formLabel: ITEM_FORM_LABEL_STYLE,
            formDescription: 'text-muted'
          }"
        >
          <NInput
            type="date"
            placeholder="YYYY-MM-DD"
          />
        </NFormField>

        <NFormField
          name="lotNumber"
          label="Lot number"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput placeholder="e.g. LOT-2024-001" />
        </NFormField>

        <NFormField
          name="barcode"
          label="Barcode"
          :una="{ formLabel: ITEM_FORM_LABEL_STYLE }"
        >
          <NInput placeholder="e.g. scan result" />
        </NFormField>
      </div>
    </div>

    <div class="flex gap-3 items-end justify-between pt-4 border-t">
      <div class="text-xs text-muted">
        Type: <span class="font-medium">{{ categoryLabel }}</span>
      </div>

      <div class="flex gap-2">
        <NButton
          type="button"
          btn="soft-gray hover:outline-gray"
          @click="emit('close')"
        >
          Cancel
        </NButton>
        <NButton
          type="submit"
          btn="soft-success hover:outline-success"
          leading="i-lucide-plus"
        >
          Create item
        </NButton>
      </div>
    </div>
  </form>
</template>
