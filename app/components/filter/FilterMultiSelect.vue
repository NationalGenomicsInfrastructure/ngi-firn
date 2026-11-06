<script setup lang="ts">
/*
 * Labeled multi-select used for the structured filters above the project list. Options carry the
 * number of matching projects, shown in parentheses. The model is the array of selected values.
 */
const model = defineModel<string[]>({ default: () => [] })

const props = defineProps<{
  label: string
  placeholder: string
  options: Array<{ value: string, count: number }>
}>()

const items = computed(() => props.options.map(option => ({
  value: option.value,
  label: `${option.value} (${option.count})`
})))
</script>

<template>
  <div class="flex flex-col gap-1 min-w-[11rem] flex-1">
    <FilterLabel>{{ label }}</FilterLabel>
    <NSelect
      :model-value="model"
      :items="items"
      multiple
      :placeholder="placeholder"
      :aria-label="label"
      @update:model-value="(v: unknown) => model = (v as string[]) ?? []"
    />
  </div>
</template>
