<script setup lang="ts">
import type { OrderDetails } from '~~/types/projects'
import { formatDate } from '~/utils/dates/formatting'

const props = defineProps<{
  orderDetails?: OrderDetails
}>()

const orderFields = computed(() => {
  if (!props.orderDetails?.fields) return []
  return Object.entries(props.orderDetails.fields)
    .filter(([_, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()),
      value: String(value)
    }))
})
</script>

<template>
  <NAlert
    v-if="!orderDetails"
    alert="border-gray"
    title="No order details"
    description="Order details are not available for this project."
    icon="i-lucide-info"
  />
  <NCard
    v-else
    card="soft-gray"
    class="w-full"
  >
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <h3 class="text-lg font-semibold tracking-tight">
        {{ orderDetails.title ?? 'Order' }}
      </h3>
      <NBadge
        v-if="orderDetails.identifier"
        badge="outline"
        :label="orderDetails.identifier"
      />
      <NBadge
        v-if="orderDetails.site"
        badge="soft-gray"
        :label="orderDetails.site"
      />
    </div>

    <div
      v-if="orderDetails.owner"
      class="mb-4"
    >
      <h4 class="text-sm font-semibold text-muted mb-2">
        Owner
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-2 text-sm">
        <div>
          <span class="font-medium text-muted">Name</span>
          <p>{{ orderDetails.owner.name ?? '—' }}</p>
        </div>
        <div>
          <span class="font-medium text-muted">Email</span>
          <p>{{ orderDetails.owner.email ?? '—' }}</p>
        </div>
        <div>
          <span class="font-medium text-muted">Affiliation</span>
          <p>{{ orderDetails.owner.affiliation ?? '—' }}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
      <div>
        <span class="font-medium text-muted">Created</span>
        <p>{{ formatDate(orderDetails.created) }}</p>
      </div>
      <div>
        <span class="font-medium text-muted">Modified</span>
        <p>{{ formatDate(orderDetails.modified) }}</p>
      </div>
    </div>

    <div
      v-if="orderFields.length"
      class="mt-2"
    >
      <h4 class="text-sm font-semibold text-muted mb-2">
        Order fields
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div
          v-for="field in orderFields"
          :key="field.label"
        >
          <span class="font-medium text-muted">{{ field.label }}</span>
          <p>{{ field.value }}</p>
        </div>
      </div>
    </div>
  </NCard>
</template>
