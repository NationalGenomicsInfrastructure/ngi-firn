<script setup lang="ts">
import {
  CONTAINER_TYPE_OPTIONS,
  resolveContainerTypeFromSelect,
  resolveNullableNumberFromInput,
  EQUIPMENT_FORM_LABEL_STYLE,
  type SelectOption
} from '~/utils/inventory/equipment'
import { ITEM_TYPE_OPTIONS, resolveItemTypeFromSelect, getChildTypeMeta } from '~/utils/inventory/item'
import {
  CONTAINER_CHILD_KIND_OPTIONS,
  resolveChildKindFromSelect,
  capacityMode,
  convertCapacityMode,
  makeCountRow,
  makeGridEntry,
  type CapacityMode,
  type ChildCategory
} from '~/utils/inventory/container'
import type { ContainerCapacity, ContainerChildKindType } from '~~/schemas/inventory/container'

const props = defineProps<{
  modelValue?: ContainerCapacity[] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ContainerCapacity[]]
}>()

const MODE_OPTIONS: SelectOption<CapacityMode>[] = [
  { value: 'none', label: 'No capacity limit' },
  { value: 'count', label: 'Count-based caps' },
  { value: 'grid', label: 'Grid layout' }
]

const entries = computed<ContainerCapacity[]>(() => props.modelValue ?? [])
const mode = computed<CapacityMode>(() => capacityMode(entries.value))

// The single grid entry when in grid mode (guards against an empty array).
const gridEntry = computed(() => (entries.value[0]?.layout === 'grid' ? entries.value[0] : null))

function typeOptionsForKind(childKind: ContainerChildKindType): SelectOption<ChildCategory>[] {
  return (childKind === 'item' ? ITEM_TYPE_OPTIONS : CONTAINER_TYPE_OPTIONS) as SelectOption<ChildCategory>[]
}

function resolveTypeForKind(childKind: ContainerChildKindType, value: unknown): ChildCategory | null {
  return childKind === 'item' ? resolveItemTypeFromSelect(value) : resolveContainerTypeFromSelect(value)
}

function emitEntries(next: ContainerCapacity[]) {
  emit('update:modelValue', next)
}

function onModeUpdate(value: unknown) {
  const next = value && typeof value === 'object' && 'value' in value
    ? (value as { value?: unknown }).value
    : value
  if (next === 'none' || next === 'count' || next === 'grid') {
    emitEntries(convertCapacityMode(entries.value, next))
  }
}

// ---------------------------------------------------------------------------
// Count mode
// ---------------------------------------------------------------------------

const usedPairs = computed(() => new Set(entries.value.map(e => `${e.childKind}:${e.type}`)))

function firstUnusedTypeForKind(childKind: ContainerChildKindType, excludeIndex: number): ChildCategory | null {
  const taken = new Set(
    entries.value
      .filter((e, i) => i !== excludeIndex && e.childKind === childKind)
      .map(e => e.type)
  )
  const option = typeOptionsForKind(childKind).find(opt => !taken.has(opt.value))
  return option ? option.value : null
}

function firstUnusedPair(): { childKind: ContainerChildKindType, type: ChildCategory } | null {
  for (const opt of CONTAINER_TYPE_OPTIONS) {
    if (!usedPairs.value.has(`container:${opt.value}`)) return { childKind: 'container', type: opt.value }
  }
  for (const opt of ITEM_TYPE_OPTIONS) {
    if (!usedPairs.value.has(`item:${opt.value}`)) return { childKind: 'item', type: opt.value }
  }
  return null
}

const hasUnusedPair = computed(() => firstUnusedPair() !== null)

function addCountRow() {
  const pair = firstUnusedPair()
  if (!pair) return
  emitEntries([...entries.value, makeCountRow(pair.childKind, pair.type)])
}

function removeCountRow(index: number) {
  emitEntries(entries.value.filter((_, i) => i !== index))
}

function isDuplicatePair(childKind: ContainerChildKindType, type: string, excludeIndex: number): boolean {
  return entries.value.some((e, i) => i !== excludeIndex && e.childKind === childKind && e.type === type)
}

function onCountKindUpdate(index: number, value: unknown) {
  const childKind = resolveChildKindFromSelect(value)
  if (!childKind) return
  const current = entries.value[index]
  if (!current) return
  // The type vocabulary changes with the kind: pick the row's first non-colliding type.
  const nextType = isDuplicatePair(childKind, current.type, index) || resolveTypeForKind(childKind, current.type) === null
    ? firstUnusedTypeForKind(childKind, index)
    : current.type
  if (nextType === null) return
  emitEntries(entries.value.map((e, i) => i === index ? makeCountRow(childKind, nextType, e.layout === 'count' ? e.capacity : undefined) : e))
}

function onCountTypeUpdate(index: number, value: unknown) {
  const current = entries.value[index]
  if (!current) return
  const type = resolveTypeForKind(current.childKind, value)
  if (!type || isDuplicatePair(current.childKind, type, index)) return
  emitEntries(entries.value.map((e, i) => i === index ? makeCountRow(current.childKind, type, e.layout === 'count' ? e.capacity : undefined) : e))
}

function onCountCapacityUpdate(index: number, value: unknown) {
  const n = resolveNullableNumberFromInput(value)
  const capacity = n == null ? 0 : Math.max(0, Math.round(n))
  emitEntries(entries.value.map((e, i) => i === index && e.layout === 'count' ? { ...e, capacity } : e))
}

// ---------------------------------------------------------------------------
// Grid mode
// ---------------------------------------------------------------------------

function onGridKindUpdate(value: unknown) {
  const childKind = resolveChildKindFromSelect(value)
  const current = gridEntry.value
  if (!childKind || !current) return
  const type = resolveTypeForKind(childKind, current.type) ?? (typeOptionsForKind(childKind)[0]?.value ?? current.type)
  emitEntries([makeGridEntry(childKind, type, current.rows, current.columns, current.levels)])
}

function onGridTypeUpdate(value: unknown) {
  const current = gridEntry.value
  if (!current) return
  const type = resolveTypeForKind(current.childKind, value)
  if (!type) return
  emitEntries([makeGridEntry(current.childKind, type, current.rows, current.columns, current.levels)])
}

function onGridDimUpdate(field: 'rows' | 'columns' | 'levels', value: unknown) {
  const current = gridEntry.value
  if (!current) return
  const n = resolveNullableNumberFromInput(value)
  const dim = n == null ? 1 : Math.max(1, Math.round(n))
  emitEntries([{ ...current, [field]: dim }])
}

const gridTotalSlots = computed(() => {
  const g = gridEntry.value
  return g ? g.rows * g.columns * g.levels : 0
})
</script>

<template>
  <div class="space-y-4">
    <NFormGroup
      label="Capacity type"
      description="Choose how this container's contents are organised."
      :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE, formGroupDescription: 'text-muted' }"
    >
      <NSelect
        :model-value="mode"
        :items="MODE_OPTIONS"
        by="value"
        @update:model-value="onModeUpdate"
      />
    </NFormGroup>

    <!-- No capacity -->
    <div
      v-if="mode === 'none'"
      class="text-sm text-muted rounded-md border border-dashed border-primary-200 dark:border-primary-800 p-4 text-center"
    >
      No capacity limit configured. This container accepts children without a declared maximum.
    </div>

    <!-- Count-based caps -->
    <template v-else-if="mode === 'count'">
      <div
        v-for="(row, index) in entries"
        :key="index"
        class="flex flex-col sm:flex-row sm:items-end gap-3 rounded-md border border-primary-100 dark:border-primary-800 p-3"
      >
        <NFormGroup
          label="Child kind"
          class="sm:w-32 shrink-0"
          :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
        >
          <!-- Read via entries[index] (not the v-for `row`): NFormGroup caches its
               default-slot vnodes in a computed, so binding to the captured loop
               variable freezes on immutable updates. -->
          <NSelect
            :model-value="entries[index]?.childKind"
            :items="CONTAINER_CHILD_KIND_OPTIONS"
            by="value"
            @update:model-value="(value: unknown) => onCountKindUpdate(index, value)"
          />
        </NFormGroup>

        <NFormGroup
          label="Type"
          class="sm:w-44 shrink-0"
          :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
        >
          <NSelect
            :model-value="entries[index]?.type"
            :items="typeOptionsForKind(row.childKind)"
            by="value"
            @update:model-value="(value: unknown) => onCountTypeUpdate(index, value)"
          />
        </NFormGroup>

        <NFormGroup
          label="Maximum capacity"
          :message="`Up to ${row.layout === 'count' ? row.capacity : 0} × ${getChildTypeMeta(row.childKind, row.type).label}`"
          class="flex-1"
          :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="entries[index]?.layout === 'count' ? String(entries[index].capacity) : '0'"
            type="number"
            min="0"
            step="1"
            @update:model-value="(value: unknown) => onCountCapacityUpdate(index, value)"
          />
        </NFormGroup>

        <NButton
          type="button"
          btn="ghost-error"
          icon
          label="i-lucide-trash-2"
          aria-label="Remove capacity entry"
          class="shrink-0"
          @click="removeCountRow(index)"
        />
      </div>

      <NButton
        type="button"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-plus"
        label="Add capacity entry"
        :disabled="!hasUnusedPair"
        @click="addCountRow()"
      />
    </template>

    <!-- Grid layout -->
    <template v-else>
      <div
        v-if="gridEntry"
        class="space-y-3 rounded-md border border-primary-100 dark:border-primary-800 p-3"
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NFormGroup
            label="Child kind"
            :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="gridEntry.childKind"
              :items="CONTAINER_CHILD_KIND_OPTIONS"
              by="value"
              @update:model-value="onGridKindUpdate"
            />
          </NFormGroup>

          <NFormGroup
            label="Type"
            :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
          >
            <NSelect
              :model-value="gridEntry.type"
              :items="typeOptionsForKind(gridEntry.childKind)"
              by="value"
              @update:model-value="onGridTypeUpdate"
            />
          </NFormGroup>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NFormGroup
            label="Rows"
            :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
          >
            <NInput
              :model-value="String(gridEntry.rows)"
              type="number"
              min="1"
              step="1"
              @update:model-value="(value: unknown) => onGridDimUpdate('rows', value)"
            />
          </NFormGroup>

          <NFormGroup
            label="Columns"
            :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
          >
            <NInput
              :model-value="String(gridEntry.columns)"
              type="number"
              min="1"
              step="1"
              @update:model-value="(value: unknown) => onGridDimUpdate('columns', value)"
            />
          </NFormGroup>

          <NFormGroup
            label="Levels"
            :una="{ formGroupLabel: EQUIPMENT_FORM_LABEL_STYLE }"
          >
            <NInput
              :model-value="String(gridEntry.levels)"
              type="number"
              min="1"
              step="1"
              @update:model-value="(value: unknown) => onGridDimUpdate('levels', value)"
            />
          </NFormGroup>
        </div>

        <p class="text-sm text-muted">
          {{ gridEntry.rows }} × {{ gridEntry.columns }}{{ gridEntry.levels > 1 ? ` × ${gridEntry.levels}` : '' }}
          grid — {{ gridTotalSlots }} slots for {{ getChildTypeMeta(gridEntry.childKind, gridEntry.type).label }}.
        </p>
      </div>
    </template>
  </div>
</template>
