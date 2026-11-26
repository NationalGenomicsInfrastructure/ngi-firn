<script setup lang="ts">
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

const props = withDefaults(defineProps<{
  actionType: InventoryActionType
  /* 'past' reports a logged action ("Checked out"), 'imperative' names one still to do ("Check out"). */
  tense?: 'past' | 'imperative'
}>(), {
  tense: 'past'
})

const meta = computed(() => getActionTypeMeta(props.actionType))
const label = computed(() => props.tense === 'past' ? meta.value.label : meta.value.progressive)
</script>

<template>
  <NBadge
    :badge="meta.badge"
    :icon="meta.icon"
    :label="label"
  />
</template>
