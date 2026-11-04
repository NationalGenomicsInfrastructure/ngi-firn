<script setup lang="ts">
/*
 * Heading for a block of content on a page.
 *
 * - `rule`    (default) Small uppercase caption with an optional meta text and a hairline that
 *             runs to the right edge. Use it to introduce a list or table ("Results").
 * - `section` Display-font heading with an icon and an optional `#badge` slot (e.g. a count).
 *             Use it to separate categories of content ("Matching projects").
 */
withDefaults(defineProps<{
  title: string
  variant?: 'rule' | 'section'
  /* Muted text next to a `rule` heading, e.g. "12 matches". */
  meta?: string
  /* Icon of a `section` heading. */
  icon?: string
  /* Heading level; pick the one that fits the page outline. */
  as?: 'h2' | 'h3'
}>(), {
  variant: 'rule',
  meta: undefined,
  icon: undefined,
  as: 'h2'
})
</script>

<template>
  <div
    v-if="variant === 'rule'"
    class="flex items-baseline gap-3"
  >
    <component
      :is="as"
      :class="UI_LABEL_STYLE"
    >
      {{ title }}
    </component>
    <span
      v-if="meta"
      class="text-sm text-muted"
    >{{ meta }}</span>
    <div
      class="h-px flex-1 bg-border"
      aria-hidden="true"
    />
  </div>

  <div
    v-else
    class="flex items-center gap-2"
  >
    <NIcon
      v-if="icon"
      :name="icon"
      class="text-xl text-primary-700 dark:text-primary-400"
    />
    <component
      :is="as"
      class="font-display text-xl font-semibold"
    >
      {{ title }}
    </component>
    <slot name="badge" />
  </div>
</template>
