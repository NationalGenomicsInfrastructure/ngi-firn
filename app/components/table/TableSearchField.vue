<script setup lang="ts">
/*
 * Labeled search box rendered above the data tables. It is a thin wrapper around `NInput`
 * that drives a table's local global filter via `v-model`. Filtering is client-side only
 * (it narrows already-loaded rows); tables whose data is a server-selected subset pass a
 * `hint` to make that scope explicit to the user.
 */
const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  label?: string
  placeholder?: string
  hint?: string
}>(), {
  label: 'Search',
  placeholder: 'Type to filter…',
  hint: undefined
})
</script>

<template>
  <div class="flex flex-col gap-1 mb-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
    <div class="flex flex-col items-start sm:items-end w-40">
      <NLabel
        for="tableSearchField"
        class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium"
      >
        {{ label }}
      </NLabel>
      <span
        v-if="hint"
        class="text-xs text-muted"
      >{{ hint }}</span>
    </div>
    <NInput
      id="tableSearchField"
      :model-value="model"
      :placeholder="placeholder"
      leading="i-lucide-search"
      :aria-label="label"
      class="w-full sm:w-72 my-2 focus-within:ring-2 focus-within:ring-primary-700 dark:focus-within:ring-primary-400"
      :una="{ inputWrapper: 'w-full' }"
      @update:model-value="model = ($event as string) ?? ''"
    >
      <template
        v-if="model"
        #trailing
      >
        <NButton
          label="i-lucide-x"
          icon
          btn="ghost-gray"
          size="xs"
          aria-label="Clear search"
          @click="model = ''"
        />
      </template>
    </NInput>
  </div>
</template>
