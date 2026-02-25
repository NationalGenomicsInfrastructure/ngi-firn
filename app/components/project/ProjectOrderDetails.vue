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
    card="outline-gray"
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
        badge="solid-gray"
        :label="orderDetails.site"
        icon="i-lucide-building"
      />
    </div>

    <div
      v-if="orderDetails.owner"
      class="mb-4"
    >
      <div class="flex items-center gap-2 mb-3">
        <NIcon
          name="i-lucide-user-circle"
          class="text-muted"
        />
        <h4 class="text-sm font-semibold">
          Owner
        </h4>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-user"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Name</span>
          </div>
          <p class="font-medium pl-5">
            {{ orderDetails.owner.name ?? '—' }}
          </p>
        </div>
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-mail"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Email</span>
          </div>
          <p class="font-medium pl-5">
            {{ orderDetails.owner.email ?? '—' }}
          </p>
        </div>
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-building-2"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Affiliation</span>
          </div>
          <p class="font-medium pl-5">
            {{ orderDetails.owner.affiliation ?? '—' }}
          </p>
        </div>
      </div>
    </div>

    <NSeparator class="my-4" />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm mb-4">
      <div>
        <div class="flex items-center gap-1.5 mb-0.5">
          <NIcon
            name="i-lucide-calendar-plus"
            class="text-primary-400 dark:text-primary-600 text-xs"
          />
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Created</span>
        </div>
        <p class="font-medium pl-5">
          {{ formatDate(orderDetails.created) }}
        </p>
      </div>
      <div>
        <div class="flex items-center gap-1.5 mb-0.5">
          <NIcon
            name="i-lucide-calendar-check"
            class="text-primary-400 dark:text-primary-600 text-xs"
          />
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Modified</span>
        </div>
        <p class="font-medium pl-5">
          {{ formatDate(orderDetails.modified) }}
        </p>
      </div>
    </div>

    <template v-if="orderFields.length">
      <NSeparator class="my-4" />

      <div class="flex items-center gap-2 mb-3">
        <NIcon
          name="i-lucide-clipboard-list"
          class="text-muted"
        />
        <h4 class="text-sm font-semibold">
          Order fields
        </h4>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div
          v-for="field in orderFields"
          :key="field.label"
        >
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">{{ field.label }}</span>
          <p class="font-medium mt-0.5">
            {{ field.value }}
          </p>
        </div>
      </div>
    </template>
  </NCard>
</template>
