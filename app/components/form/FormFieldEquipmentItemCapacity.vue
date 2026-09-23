<script setup lang="ts">
import type { EquipmentItemCapacity } from '~~/schemas/inventory/equipment'
import { ITEM_TYPE_LABELS, ITEM_TYPE_OPTIONS, resolveItemTypeFromSelect } from '~/utils/inventory/item'
import { EQUIPMENT_FORM_LABEL_STYLE } from '~/utils/inventory/equipment'

const props = defineProps<{ modelValue?: EquipmentItemCapacity[] | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: EquipmentItemCapacity[]] }>()

const rows = computed(() => props.modelValue ?? [])
const usedCategories = computed(() => new Set(rows.value.map(row => row.category)))

function emitRows(value: EquipmentItemCapacity[]) {
  emit('update:modelValue', value)
}

function addRow() {
  const category = ITEM_TYPE_OPTIONS.find(option => !usedCategories.value.has(option.value))?.value
  if (category) emitRows([...rows.value, { category, capacity: 10 }])
}

function updateCategory(index: number, value: unknown) {
  const category = resolveItemTypeFromSelect(value)
  if (!category || rows.value.some((row, rowIndex) => rowIndex !== index && row.category === category)) return
  emitRows(rows.value.map((row, rowIndex) => rowIndex === index ? { ...row, category } : row))
}

function updateCapacity(index: number, value: number[] | undefined) {
  const capacity = value?.[0]
  if (capacity == null) return
  emitRows(rows.value.map((row, rowIndex) => rowIndex === index ? { ...row, capacity } : row))
}
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="rows.length === 0"
      class="text-sm text-muted rounded-md border border-dashed border-primary-200 dark:border-primary-800 p-4 text-center"
    >
      No direct item capacities configured. Unlisted item categories remain unlimited.
    </p>
    <div
      v-for="(row, index) in rows"
      :key="row.category"
      class="flex flex-col sm:flex-row sm:items-end gap-3 rounded-md border border-primary-100 dark:border-primary-800 p-3"
    >
      <NFormGroup
        label="Item type"
        class="sm:w-52 shrink-0"
        :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="rows[index]?.category"
          :items="ITEM_TYPE_OPTIONS.filter(option => option.value === row.category || !usedCategories.has(option.value))"
          by="value"
          @update:model-value="(value: unknown) => updateCategory(index, value)"
        />
      </NFormGroup>
      <NFormGroup
        label="Maximum capacity"
        class="flex-1"
        :message="`${row.capacity} ${ITEM_TYPE_LABELS[row.category].toLowerCase()}${row.capacity === 1 ? '' : 's'}`"
        :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NSlider
          :model-value="[rows[index]?.capacity ?? 0]"
          :min="0"
          :max="100"
          :step="1"
          @update:model-value="(value: number[] | undefined) => updateCapacity(index, value)"
        />
      </NFormGroup>
      <NButton
        type="button"
        btn="ghost-error"
        icon
        label="i-lucide-trash-2"
        :aria-label="`Remove ${ITEM_TYPE_LABELS[row.category]} capacity`"
        @click="emitRows(rows.filter((_, rowIndex) => rowIndex !== index))"
      />
    </div>
    <NButton
      type="button"
      btn="soft-primary hover:outline-primary"
      leading="i-lucide-plus"
      label="Add item type"
      :disabled="usedCategories.size >= ITEM_TYPE_OPTIONS.length"
      @click="addRow"
    />
  </div>
</template>
