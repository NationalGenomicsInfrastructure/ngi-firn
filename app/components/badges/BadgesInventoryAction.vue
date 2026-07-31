<script setup lang="ts">
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

const props = defineProps<{
  actionType: InventoryActionType
}>()

const meta = computed(() => getActionTypeMeta(props.actionType))
</script>

<template>
  <NBadge
    :badge="meta.badge"
    :icon="meta.icon"
    :label="meta.label"
  />
</template>
