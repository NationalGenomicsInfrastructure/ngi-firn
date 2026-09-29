<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayInventoryActionLogEntry, InventoryActiveFlag, SerializedEntityRef } from '~~/types/inventory'
import type { InventoryStatusType } from '~~/schemas/inventory/metadata'
import { formatTemperature } from '~~/schemas/inventory/temperature'
import { barcodeLookupQuery } from '~/utils/queries/inventory/barcodes'
import { itemBySlugQuery } from '~/utils/queries/inventory/items'
import { containerBySlugQuery } from '~/utils/queries/inventory/containers'
import { equipmentBySlugQuery } from '~/utils/queries/inventory/equipment'
import { getContainerStatusMeta } from '~/utils/inventory/container'
import { formatDate, getExpirationStatus } from '~/utils/dates/formatting'

/*
 * Scanner info card.
 * ******************
 *
 * Shows the handful of facts a person at the freezer needs about one scanned entity:
 * what it is, where it belongs, how cold it must be, when it expires and who touched
 * it last. The code is first resolved to a kind and slug, then read through the
 * regular detail queries so this card shares their cache and refreshes whenever a
 * scan is applied elsewhere on the page.
 */

const props = defineProps<{
  code: string
}>()

/* Expiry within this many days is highlighted before it actually passes. */
const EXPIRY_WARNING_DAYS = 30

const { state: lookupState, asyncStatus: lookupStatus } = useQueryColada(() => barcodeLookupQuery(props.code))
const hit = computed(() => lookupState.value.status === 'success' ? lookupState.value.data : null)

const { state: itemState, asyncStatus: itemStatus } = useQueryColada(() => ({
  ...itemBySlugQuery(hit.value?.slug ?? ''),
  enabled: hit.value?.entityKind === 'item'
}))
const { state: containerState, asyncStatus: containerStatus } = useQueryColada(() => ({
  ...containerBySlugQuery(hit.value?.slug ?? ''),
  enabled: hit.value?.entityKind === 'container'
}))
const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(() => ({
  ...equipmentBySlugQuery(hit.value?.slug ?? ''),
  enabled: hit.value?.entityKind === 'equipment'
}))

/* One display shape for all three kinds, so the template has a single layout. */
interface EntityInfo {
  kindLabel: string
  kindIcon: string
  name: string
  label: string | null
  detailsRoute: string
  status: InventoryStatusType | null
  activeFlags: InventoryActiveFlag[] | null
  location: SerializedEntityRef | null
  slot: string | null
  temperature: string
  expiryDate: string | null
  lastAction: DisplayInventoryActionLogEntry | null
  hasActionLog: boolean
}

function newestEntry(log: DisplayInventoryActionLogEntry[]): DisplayInventoryActionLogEntry | null {
  return log.reduce<DisplayInventoryActionLogEntry | null>(
    (newest, entry) => !newest || entry.timestamp > newest.timestamp ? entry : newest,
    null
  )
}

const info = computed<EntityInfo | null>(() => {
  const kind = hit.value?.entityKind
  if (kind === 'item' && itemState.value.data) {
    const item = itemState.value.data
    return {
      kindLabel: 'Item',
      kindIcon: 'i-lucide-test-tube',
      name: item.name,
      label: item.label,
      detailsRoute: `/inventory/items/${encodeURIComponent(item.slug)}/details`,
      status: item.status,
      activeFlags: item.activeFlags,
      location: item.parentRef,
      slot: item.position?.label ?? null,
      temperature: formatTemperature(item.temperatureCategory, item.temperatureCelsius),
      expiryDate: item.expiryDate,
      lastAction: newestEntry(item.recentActionLog),
      hasActionLog: true
    }
  }
  if (kind === 'container' && containerState.value.data) {
    const container = containerState.value.data
    return {
      kindLabel: 'Container',
      kindIcon: 'i-lucide-package',
      name: container.name,
      label: container.label,
      detailsRoute: `/inventory/containers/${encodeURIComponent(container.slug)}/details`,
      status: container.status,
      activeFlags: container.activeFlags,
      location: container.parentRef,
      slot: container.positionParent?.label ?? null,
      temperature: formatTemperature(container.temperatureCategory, container.temperatureCelsius),
      expiryDate: null,
      lastAction: newestEntry(container.recentActionLog),
      hasActionLog: true
    }
  }
  if (kind === 'equipment' && equipmentState.value.data) {
    const equipment = equipmentState.value.data
    return {
      kindLabel: 'Storage equipment',
      kindIcon: 'i-lucide-refrigerator',
      name: equipment.name,
      label: equipment.label,
      detailsRoute: `/inventory/equipment/${encodeURIComponent(equipment.slug)}/details`,
      status: null,
      activeFlags: null,
      location: equipment.parentRoom,
      slot: null,
      temperature: formatTemperature(equipment.temperatureCategory, equipment.temperatureCelsius),
      expiryDate: null,
      lastAction: null,
      hasActionLog: false
    }
  }
  return null
})

const isLoading = computed(() =>
  lookupStatus.value === 'loading'
  || itemStatus.value === 'loading'
  || containerStatus.value === 'loading'
  || equipmentStatus.value === 'loading')

const loadError = computed(() =>
  lookupState.value.error
  ?? itemState.value.error
  ?? containerState.value.error
  ?? equipmentState.value.error
  ?? null)

const notFound = computed(() =>
  lookupState.value.status === 'success' && !hit.value)

const statusMeta = computed(() => info.value?.status ? getContainerStatusMeta(info.value.status) : null)

const locationRoute = computed(() => {
  const location = info.value?.location
  if (!location) return null
  const slug = encodeURIComponent(location.slug)
  if (location.kind === 'room') return `/inventory/rooms/${slug}`
  if (location.kind === 'equipment') return `/inventory/equipment/${slug}/details`
  return `/inventory/containers/${slug}/details`
})

const locationIcon = computed(() => {
  const kind = info.value?.location?.kind
  if (kind === 'room') return 'i-lucide-door-open'
  if (kind === 'equipment') return 'i-lucide-refrigerator'
  return 'i-lucide-package'
})

const expiryStatus = computed(() => info.value?.expiryDate
  ? getExpirationStatus(info.value.expiryDate, EXPIRY_WARNING_DAYS)
  : null)
</script>

<template>
  <div>
    <NAlert
      v-if="isLoading && !info"
      alert="border-gray"
      title="Looking up barcode..."
      :description="code"
      icon="i-lucide-loader-2"
    />
    <NAlert
      v-else-if="loadError"
      alert="border-error"
      title="Barcode could not be looked up"
      :description="loadError.message"
      icon="i-lucide-alert-circle"
    />
    <NAlert
      v-else-if="notFound"
      alert="border-warning"
      title="Unknown barcode"
      :description="`No item, container or storage equipment carries the barcode ${code}.`"
      icon="i-lucide-search-x"
    />

    <NCard
      v-else-if="info"
      card="outline-gray"
      :_card-content="{ class: 'space-y-5 py-5' }"
    >
      <header class="space-y-3">
        <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
          <NIcon :name="info.kindIcon" />
          {{ info.kindLabel }}
          <span class="ml-auto font-mono normal-case tracking-normal text-muted">{{ code }}</span>
        </div>
        <h3 class="text-2xl sm:text-3xl font-bold break-words leading-tight">
          {{ info.name }}
        </h3>
        <p
          v-if="info.label"
          class="text-muted"
        >
          {{ info.label }}
        </p>
        <div
          v-if="statusMeta || info.activeFlags?.length"
          class="flex flex-wrap items-center gap-2"
        >
          <NBadge
            v-if="statusMeta"
            :label="statusMeta.label"
            :icon="statusMeta.icon"
            :badge="statusMeta.badge"
            size="md"
          />
          <BadgesInventoryFlag
            v-for="flag in info.activeFlags ?? []"
            :key="flag.kind"
            :flag="flag.kind"
            :comment="flag.comment"
          />
        </div>
      </header>

      <NSeparator />

      <NuxtLink
        v-if="info.location && locationRoute"
        :to="locationRoute"
        class="flex items-center gap-4 rounded-lg bg-muted/30 p-4 hover:bg-muted/50 transition-colors"
      >
        <NIcon
          :name="locationIcon"
          class="text-3xl text-primary shrink-0"
        />
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
            {{ info.status === 'in_use' ? 'Belongs in' : 'Stored in' }}
          </p>
          <p class="text-lg font-semibold break-words">
            {{ info.location.name }}
            <span
              v-if="info.slot"
              class="text-muted font-normal"
            >· slot {{ info.slot }}</span>
          </p>
        </div>
        <NIcon
          name="i-lucide-chevron-right"
          class="ml-auto text-muted shrink-0"
        />
      </NuxtLink>
      <div
        v-else
        class="flex items-center gap-4 rounded-lg bg-muted/30 p-4"
      >
        <NIcon
          name="i-lucide-map-pin-off"
          class="text-3xl text-muted shrink-0"
        />
        <p class="font-medium">
          Not placed in storage
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-base">
        <IndicatorIconText
          icon="i-lucide-thermometer-snowflake"
          label="Temperature"
          :value="info.temperature"
        />
        <IndicatorIconText
          v-if="info.kindLabel === 'Item'"
          icon="i-lucide-calendar-x"
          label="Expiry"
        >
          <span v-if="!info.expiryDate">—</span>
          <span
            v-else
            class="inline-flex flex-wrap items-center gap-2"
          >
            {{ formatDate(info.expiryDate) }}
            <NBadge
              v-if="expiryStatus === 'expired'"
              badge="solid-error"
              label="Expired"
            />
            <NBadge
              v-else-if="expiryStatus === 'expiring-soon'"
              badge="solid-yellow"
              label="Expires soon"
            />
          </span>
        </IndicatorIconText>
        <!-- Not IndicatorIconText: its value slot is a <p>, which cannot hold the avatar's <div>. -->
        <div
          v-if="info.hasActionLog"
          class="sm:col-span-2"
        >
          <div class="flex items-center gap-1.5 mb-1">
            <NIcon
              name="i-lucide-user"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Last handled
            </span>
          </div>
          <p
            v-if="!info.lastAction"
            class="font-medium pl-5"
          >
            —
          </p>
          <div
            v-else
            class="flex flex-wrap items-center gap-2 pl-5"
          >
            <IndicatorUserAvatar :user="info.lastAction.firnUser" />
            <BadgesInventoryAction :action-type="info.lastAction.actionType" />
            <span class="text-sm text-muted">
              {{ formatDate(info.lastAction.timestamp, { time: true }) }}
            </span>
          </div>
        </div>
      </div>

      <NSeparator />

      <NButton
        :to="info.detailsRoute"
        btn="soft-primary hover:outline-primary"
        size="lg"
        leading="i-lucide-external-link"
        label="Open details"
        class="w-full sm:w-auto"
      />
    </NCard>
  </div>
</template>
