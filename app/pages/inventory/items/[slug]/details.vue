<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { itemBySlugQuery, itemProjectRefsQuery } from '~/utils/queries/inventory/items'
import { ITEM_TYPE_LABELS, ITEM_TYPE_ICONS } from '~/utils/inventory/item'
import { getClassificationBadge, getContainerStatusMeta } from '~/utils/inventory/container'
import { formatDate } from '~/utils/dates/formatting'

definePageMeta({ layout: 'private' })

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})
const { state, asyncStatus } = useQueryColada(() => itemBySlugQuery(slug.value))
const item = computed(() => state.value.status === 'success' ? state.value.data : null)
const { state: projectState } = useQueryColada(() => ({
  ...itemProjectRefsQuery(slug.value),
  enabled: (item.value?.projectRefs?.length ?? 0) > 0
}))
const projects = computed(() => projectState.value.status === 'success' ? projectState.value.data : [])

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)
const statusMeta = computed(() => item.value ? getContainerStatusMeta(item.value.status) : null)
const isLost = computed(() => item.value?.status === 'lost')
const isDisposed = computed(() => item.value?.status === 'disposed')
const isUnplaced = computed(() => item.value != null && !item.value.parentRef)
const parentRoute = computed(() => {
  const parent = item.value?.parentRef
  if (!parent) return null
  return parent.kind === 'equipment'
    ? `/inventory/equipment/${encodeURIComponent(parent.slug)}/details`
    : `/inventory/containers/${encodeURIComponent(parent.slug)}/details`
})
const parentIcon = computed(() => item.value?.parentRef?.kind === 'equipment'
  ? 'i-lucide-refrigerator'
  : 'i-lucide-package')

function typedValue(value: number | null, unit: string | null): string {
  return value == null ? '—' : `${value}${unit ? ` ${unit}` : ''}`
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="item ? `${item.name} — Details` : 'Item details'"
      :description="item ? ITEM_TYPE_LABELS[item.category] : '—'"
    />

    <NAlert
      v-if="asyncStatus === 'loading'"
      alert="border-gray"
      title="Loading item..."
      description="Fetching item details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />
    <NAlert
      v-else-if="state.status === 'error'"
      alert="border-error"
      title="Item could not be loaded"
      :description="state.error?.message ?? 'Something went wrong while loading item details.'"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />
    <NAlert
      v-else-if="!item"
      alert="border-warning"
      title="Item not found"
      description="No item exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <InventoryItemTabs />

      <NCard
        card="outline-gray"
        :_card-content="{ class: 'space-y-4 py-4' }"
      >
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Inventory item
            </p>
            <h3 class="text-lg font-semibold">
              {{ item.name }}
            </h3>
            <p class="text-sm text-muted">
              {{ item.label || '—' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <NBadge
              :label="item.classification ?? 'Uncategorized'"
              :badge="item.classification ? getClassificationBadge(item.classification) : 'soft-gray'"
            />
            <NBadge
              v-if="statusMeta"
              :label="statusMeta.label"
              :icon="statusMeta.icon"
              :badge="statusMeta.badge"
            />
          </div>
        </header>

        <template v-if="item.activeFlags?.length">
          <NSeparator />
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Active flags</span>
            <BadgesInventoryFlag
              v-for="flag in item.activeFlags"
              :key="flag.kind"
              :flag="flag.kind"
              :comment="flag.comment"
            />
          </div>
        </template>

        <NSeparator />
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          <IndicatorIconText
            icon="i-lucide-key-round"
            label="Identifier"
            :value="item.slug"
          />
          <IndicatorIconText
            :icon="ITEM_TYPE_ICONS[item.category]"
            label="Type"
            :value="ITEM_TYPE_LABELS[item.category]"
          />
          <IndicatorIconText
            icon="i-lucide-tags"
            label="Classification"
            :value="item.classification ?? 'Uncategorized'"
          />
          <IndicatorIconText
            icon="i-lucide-package"
            label="Quantity"
            :value="typedValue(item.quantity, item.unit)"
          />
          <IndicatorIconText
            icon="i-lucide-flask-conical"
            label="Concentration"
            :value="typedValue(item.concentration, item.concentrationUnit)"
          />
          <IndicatorIconText
            icon="i-lucide-grid-3x3"
            label="Position"
            :value="item.position?.label ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-scan-barcode"
            label="Barcode"
            :value="item.barcode ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-box"
            label="Lot number"
            :value="item.lotNumber ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-layout-template"
            label="Template"
            :value="item.templateId ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-calendar-plus"
            label="Arrival date"
            :value="item.arrivalDate ? formatDate(item.arrivalDate) : '—'"
          />
          <IndicatorIconText
            icon="i-lucide-calendar-check"
            label="Opening date"
            :value="item.openingDate ? formatDate(item.openingDate) : '—'"
          />
          <IndicatorIconText
            icon="i-lucide-calendar-x"
            label="Expiry date"
            :value="item.expiryDate ? formatDate(item.expiryDate) : '—'"
          />
          <IndicatorIconText
            icon="i-lucide-align-left"
            label="Description"
            :value="item.description ?? '—'"
            class="sm:col-span-2"
          />
          <IndicatorIconText
            icon="i-lucide-sticky-note"
            label="Notes"
            :value="item.notes ?? '—'"
            class="sm:col-span-2"
          />
        </div>

        <NSeparator />
        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DialogAlterItems :items="[item]" />
          <DialogLocateItems
            v-if="isLost"
            :items="[item]"
          />
          <DialogMoveItems
            v-if="!isLost && !isDisposed"
            :items="[item]"
          />
          <DrawerInventoryItemEdit :item="item" />
          <DialogDeleteItem
            v-if="isAdmin"
            :items="[item]"
          />
        </footer>
      </NCard>

      <NCard
        v-if="item.parentRef"
        title="Item location"
        description="The parent that directly holds this item."
        card="outline-gray"
      >
        <IndicatorIconLarge
          :icon="parentIcon"
          label="Stored in"
          :value="`${item.parentRef.name} (${item.parentRef.slug})`"
        />
        <NSeparator />
        <div class="flex justify-end">
          <NButton
            label="Open parent"
            btn="soft-primary hover:outline-primary"
            :leading="parentIcon"
            :to="parentRoute ?? undefined"
          />
        </div>
      </NCard>

      <NCard
        v-else-if="isUnplaced"
        title="Item location"
        description="This item is not currently stored in a parent."
        card="outline-gray"
      >
        <NAlert
          :alert="isDisposed ? 'soft-error' : 'soft-warning'"
          :title="isDisposed ? 'Disposed — no longer stored' : isLost ? 'Lost — awaiting location' : 'Unplaced'"
          :icon="isDisposed ? 'i-lucide-trash-2' : 'i-lucide-map-pin-off'"
        >
          <p class="text-sm">
            {{ isDisposed ? 'This item was disposed and has released its slot.' : isLost ? 'This item was marked missing. Use Locate to return it to storage once found.' : 'This item currently occupies no slot in the storage hierarchy.' }}
          </p>
        </NAlert>
      </NCard>

      <NCard
        v-if="item.projectRefs?.length"
        title="Project information"
        description="Projects associated with this item."
        card="outline-gray"
      >
        <div class="space-y-3">
          <div
            v-for="project in projects"
            :key="project.projectId"
            class="rounded-md bg-muted/30 p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium">
                {{ project.projectName }}
              </p>
              <NBadge
                badge="outline"
                :label="project.projectId"
              />
            </div>
            <p class="text-sm text-muted">
              {{ [project.application, project.affiliation, project.status].filter(Boolean).join(' · ') || 'No additional project metadata' }}
            </p>
          </div>
        </div>
      </NCard>

      <div class="flex justify-end">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to items"
          to="/inventory/items"
        />
      </div>
    </div>
  </main>
</template>
