<script setup lang="ts">
/*
 * `NCard` with the signature primary-colored left edge and correct padding on all sides.
 *
 * Una's card content drops its top padding when it expects a header slot; cards without a header
 * therefore need explicit padding. This wrapper takes care of that, so use it for any card that
 * has no `title`/header and should carry the accent edge. Extra attributes (`class`, `card`, …)
 * are forwarded to `NCard`.
 */
withDefaults(defineProps<{
  /* `lg` (8px) for the main card of a block, `sm` (6px) for small cards repeated in a grid. */
  edge?: 'lg' | 'sm'
}>(), {
  edge: 'lg'
})
</script>

<template>
  <NCard
    card="outline-gray"
    class="shadow-sm"
    :class="edge === 'lg' ? UI_ACCENT_EDGE : UI_ACCENT_EDGE_SM"
    :_card-content="{ class: 'p-5 pt-5' }"
  >
    <slot />
  </NCard>
</template>
