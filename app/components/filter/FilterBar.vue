<script setup lang="ts">
/*
 * Shared surface for the search / filter controls above result lists.
 *
 * Anatomy: one raised surface with a signature primary-colored left edge (the same cue as the
 * expanded rows in the project table), a top row and a tinted strip for the filters.
 *
 * - `#primary`   Top row for a prominent search input. Takes precedence over `title`.
 * - `title`      Slim header row (icon, title, description) for form-style filters.
 * - `#actions`   Right-aligned content of the header row (counts, "Clear filters").
 * - default slot Filter controls, rendered in the tinted strip.
 */
withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: string
  /* Aria label for the surrounding region. */
  label?: string
}>(), {
  title: undefined,
  description: undefined,
  icon: 'i-lucide-filter',
  label: undefined
})
</script>

<template>
  <section
    :aria-label="label ?? title"
    :class="UI_ACCENT_EDGE"
    class="overflow-hidden rounded-lg border border-base bg-background shadow-sm transition focus-within:ring-4 focus-within:ring-primary-500/15 focus-within:shadow-lg mb-8"
  >
    <div
      v-if="$slots.primary"
      class="flex items-center gap-3 px-3 sm:px-5"
    >
      <slot name="primary" />
    </div>
    <header
      v-else-if="title"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-13 px-5 py-2 border-b border-base"
    >
      <NIcon
        :name="icon"
        class="text-primary-700 dark:text-primary-400 text-lg shrink-0"
      />
      <h2 class="text-sm font-semibold">
        {{ title }}
      </h2>
      <p
        v-if="description"
        class="text-sm text-muted"
      >
        {{ description }}
      </p>
      <div
        v-if="$slots.actions"
        class="ml-auto flex items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </header>

    <div
      class="bg-muted/40 px-5 py-4"
      :class="{ 'border-t border-base': $slots.primary }"
    >
      <slot />
    </div>
  </section>
</template>
