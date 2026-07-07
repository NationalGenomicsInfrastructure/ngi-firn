<script setup lang="ts">
import {
  CONTAINER_TYPE_OPTIONS,
  CONTAINER_TYPE_LABELS,
  CAPACITY_SLIDER_MIN,
  CAPACITY_SLIDER_MAX,
  CAPACITY_SLIDER_STEP,
  EQUIPMENT_FORM_LABEL_STYLE,
  resolveContainerTypeFromSelect,
  type CapacityRow
} from '~/utils/inventory/equipment'
import type { ContainerType } from '~~/schemas/inventory/container'

const props = defineProps<{
  modelValue?: CapacityRow[] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CapacityRow[]]
}>()

const DEFAULT_CAPACITY = 10

const rows = computed<CapacityRow[]>(() => props.modelValue ?? [])

const usedTypes = computed(() => new Set(rows.value.map(row => row.type)))

const hasUnusedType = computed(() => usedTypes.value.size < CONTAINER_TYPE_OPTIONS.length)

function firstUnusedType(): ContainerType | null {
  const option = CONTAINER_TYPE_OPTIONS.find(opt => !usedTypes.value.has(opt.value))
  return option ? option.value : null
}

// Options for a given row: all types not used by *other* rows (keeps its own).
function optionsForRow(index: number) {
  const currentType = rows.value[index]?.type
  return CONTAINER_TYPE_OPTIONS.filter(
    opt => opt.value === currentType || !usedTypes.value.has(opt.value)
  )
}

function emitRows(next: CapacityRow[]) {
  emit('update:modelValue', next)
}

function addRow() {
  const type = firstUnusedType()
  if (!type) return
  emitRows([...rows.value, { type, capacity: DEFAULT_CAPACITY }])
}

function removeRow(index: number) {
  emitRows(rows.value.filter((_, i) => i !== index))
}

function onTypeUpdate(index: number, value: unknown) {
  const resolved = resolveContainerTypeFromSelect(value)
  if (!resolved) return
  // Ignore if the type is already used by another row.
  if (rows.value.some((row, i) => i !== index && row.type === resolved)) return
  const next = rows.value.map((row, i) => i === index ? { ...row, type: resolved } : row)
  emitRows(next)
}

function onCapacityUpdate(index: number, value: number[] | undefined) {
  if (!value || value.length === 0) return
  const next = rows.value.map((row, i) => i === index ? { ...row, capacity: value[0]! } : row)
  emitRows(next)
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="rows.length === 0"
      class="text-sm text-muted rounded-md border border-dashed border-primary-200 dark:border-primary-800 p-4 text-center"
    >
      No container capacities configured. Add a container type to set a maximum capacity.
    </div>

    <div
      v-for="(row, index) in rows"
      :key="index"
      class="flex flex-col sm:flex-row sm:items-end gap-3 rounded-md border border-primary-100 dark:border-primary-800 p-3"
    >
      <NFormGroup
        :label="'Container type'"
        class="sm:w-40 shrink-0"
        :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="row.type"
          :items="optionsForRow(index)"
          by="value"
          @update:model-value="(value: unknown) => onTypeUpdate(index, value)"
        />
      </NFormGroup>

      <NFormGroup
        :label="'Maximum capacity'"
        :message="`${row.capacity} ${CONTAINER_TYPE_LABELS[row.type].toLowerCase()}${row.capacity === 1 ? '' : 's'}`"
        class="flex-1"
        :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
      >
        <NSlider
          :model-value="[row.capacity]"
          :min="CAPACITY_SLIDER_MIN"
          :max="CAPACITY_SLIDER_MAX"
          :step="CAPACITY_SLIDER_STEP"
          @update:model-value="(value: number[] | undefined) => onCapacityUpdate(index, value)"
        />
      </NFormGroup>

      <NButton
        type="button"
        btn="ghost-error"
        icon
        label="i-lucide-trash-2"
        :aria-label="`Remove ${CONTAINER_TYPE_LABELS[row.type]} capacity`"
        class="shrink-0"
        @click="removeRow(index)"
      />
    </div>

    <NButton
      type="button"
      btn="soft-primary hover:outline-primary"
      leading="i-lucide-plus"
      label="Add container type"
      :disabled="!hasUnusedType"
      @click="addRow()"
    />
  </div>
</template>
