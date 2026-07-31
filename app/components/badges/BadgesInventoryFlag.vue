<script setup lang="ts">
import type { InventoryFlagType } from '~~/schemas/inventory/metadata'
import { getFlagMeta } from '~/utils/inventory/actionLog'

const props = defineProps<{
  flag: InventoryFlagType
}>()

const meta = computed(() => getFlagMeta(props.flag))
</script>

<template>
  <NBadge
    :badge="meta.badge"
    :icon="meta.icon"
    :label="meta.label"
  />
</template>
