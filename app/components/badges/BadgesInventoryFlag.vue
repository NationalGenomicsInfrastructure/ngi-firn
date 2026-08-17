<script setup lang="ts">
import type { InventoryFlagType } from '~~/schemas/inventory/metadata'
import { getFlagMeta } from '~/utils/inventory/actionLog'

const props = defineProps<{
  flag: InventoryFlagType
  /* Optional reason the flag was raised. When present, the badge shows it in a tooltip. */
  comment?: string | null
}>()

const meta = computed(() => getFlagMeta(props.flag))
const hasComment = computed(() => !!props.comment?.trim())
</script>

<template>
  <NTooltip
    v-if="hasComment"
    :content="comment!"
  >
    <NBadge
      :badge="meta.badge"
      :icon="meta.icon"
      :label="meta.label"
    />
  </NTooltip>
  <NBadge
    v-else
    :badge="meta.badge"
    :icon="meta.icon"
    :label="meta.label"
  />
</template>
