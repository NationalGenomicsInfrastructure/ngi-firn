<script setup lang="ts">
import type { ColumnDef, RowSelectionState, Table } from '@tanstack/vue-table'
import type { DisplayContainer, InventoryActiveFlag, SerializedEntityRef } from '~~/types/inventory'
import type { ContainerType } from '~~/schemas/inventory/container'
import type { InventoryClassificationType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import { CONTAINER_TYPE_LABELS, CONTAINER_TYPE_ICONS } from '~/utils/inventory/equipment'
import { getContainerStatusMeta, getClassificationBadge, summarizeCapacity } from '~/utils/inventory/container'
import { formatDate } from '~/utils/dates/formatting'

const props = withDefaults(defineProps<{
  containers: DisplayContainer[]
  loading?: boolean
  /* Show the Parent column — enable for global/mixed lists, disable for single-parent views. */
  showParent?: boolean
}>(), {
  loading: false,
  showParent: true
})

interface ContainerRow {
  slug: string
  name: string
  label: string | null
  containerType: ContainerType
  typeLabel: string
  typeIcon: string
  classification: InventoryClassificationType
  status: InventoryStatusType
  barcode: string | null
  description: string | null
  parentName: string
  parentSlug: string | null
  parentKind: SerializedEntityRef['kind'] | null
  capacityLabel: string
  templateId: string | null
  projectRefs: SerializedEntityRef[]
  activeFlags: InventoryActiveFlag[]
  createdAt: string
  updatedAt: string
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

// Keep every column visually uniform: links and badges share the table's `text-sm`
// weight/size instead of the badge preset's smaller `text-xs`.
const TABLE_LINK_STYLE = 'text-sm font-medium hover:underline'
const TABLE_BADGE_UNA = { badge: '!text-sm !font-medium' }

const columns = computed<ColumnDef<ContainerRow>[]>(() => {
  const cols: ColumnDef<ContainerRow>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      meta: {
        una: {
          tableCell: 'text-primary-700 dark:text-primary-400 font-medium',
          tableHead: TABLE_HEAD_STYLE
        }
      }
    },
    { header: 'Type', accessorKey: 'typeLabel' },
    { header: 'Classification', accessorKey: 'classification' }
  ]

  if (props.showParent) {
    cols.push({ header: 'Parent', accessorKey: 'parentName' })
  }

  cols.push({ header: 'Status', accessorKey: 'status' })
  return cols
})

function containerUrl(slug: string, section: string): string {
  return `/inventory/containers/${encodeURIComponent(slug)}/${section}`
}

function parentUrl(row: ContainerRow): string | null {
  if (!row.parentSlug || !row.parentKind) return null
  return row.parentKind === 'equipment'
    ? `/inventory/equipment/${encodeURIComponent(row.parentSlug)}/details`
    : `/inventory/containers/${encodeURIComponent(row.parentSlug)}`
}

const tableData = computed((): ContainerRow[] => {
  return props.containers.map((c) => {
    const summary = summarizeCapacity(c.capacity)
    return {
      slug: c.slug,
      name: c.name,
      label: c.label,
      containerType: c.containerType,
      typeLabel: CONTAINER_TYPE_LABELS[c.containerType] ?? c.containerType,
      typeIcon: CONTAINER_TYPE_ICONS[c.containerType] ?? 'i-lucide-package',
      classification: c.classification,
      status: c.status,
      barcode: c.barcode,
      description: c.description,
      parentName: c.parentRef?.name ?? '—',
      parentSlug: c.parentRef?.slug ?? null,
      parentKind: c.parentRef?.kind ?? null,
      capacityLabel: summary ? `${summary.stored} / ${summary.total} occupied` : '—',
      templateId: c.templateId,
      projectRefs: c.projectRefs ?? [],
      activeFlags: c.activeFlags ?? [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  })
})

const pagination = ref({ pageSize: 20, pageIndex: 0 })
const expanded = ref<Record<string, boolean>>({})
const select = ref<RowSelectionState>()
const table = useTemplateRef<Table<ContainerRow>>('table')

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

// Map slugs back to the full DisplayContainer objects the batch dialogs consume.
const containerBySlug = computed(() => {
  const map = new Map<string, DisplayContainer>()
  for (const c of props.containers) map.set(c.slug, c)
  return map
})

// Referencing select.value keeps this reactive to selection changes.
const selectedContainers = computed<DisplayContainer[]>(() => {
  void select.value
  const rows = table.value?.getFilteredSelectedRowModel().rows ?? []
  return rows
    .map(row => containerBySlug.value.get(row.original.slug))
    .filter((c): c is DisplayContainer => c != null)
})

function clearSelection() {
  select.value = undefined
}

// Batch-action gating by status (mirrors the server-side state machine):
//   - Locate: only when every selected container is lost.
//   - Move: only for placed/active containers (never lost or disposed).
const allSelectedLost = computed(() =>
  selectedContainers.value.length > 0 && selectedContainers.value.every(c => c.status === 'lost')
)
const canMoveSelection = computed(() =>
  selectedContainers.value.length > 0
  && selectedContainers.value.every(c => c.status !== 'lost' && c.status !== 'disposed')
)
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
      v-model:row-selection="select"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      :pagination="pagination"
      enable-row-selection
      enable-sorting
      enable-multi-sort
      empty-text="No containers found"
      empty-icon="i-lucide-package"
    >
      <template #name-cell="{ cell }">
        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink
            :to="containerUrl(cell.row.original.slug, 'contents')"
            class="text-primary-400 dark:text-primary-600"
            :class="TABLE_LINK_STYLE"
          >
            {{ cell.row.original.name }}
          </NuxtLink>
          <div
            v-if="cell.row.original.activeFlags && cell.row.original.activeFlags.length"
            class="flex flex-wrap items-center gap-1"
          >
            <BadgesInventoryFlag
              v-for="flag in cell.row.original.activeFlags"
              :key="flag.kind"
              :flag="flag.kind"
              :comment="flag.comment"
              :icon-only="true"
            />
          </div>
        </div>
      </template>

      <template #typeLabel-cell="{ cell }">
        <NBadge
          :label="cell.row.original.typeLabel"
          :icon="cell.row.original.typeIcon"
          badge="soft-primary"
          :una="TABLE_BADGE_UNA"
        />
      </template>

      <template #classification-cell="{ cell }">
        <NBadge
          :label="cell.row.original.classification"
          :badge="getClassificationBadge(cell.row.original.classification)"
          :una="TABLE_BADGE_UNA"
        />
      </template>

      <template #parentName-cell="{ cell }">
        <NuxtLink
          v-if="parentUrl(cell.row.original)"
          :to="parentUrl(cell.row.original)!"
          class="text-muted"
          :class="TABLE_LINK_STYLE"
        >
          {{ cell.row.original.parentName }}
        </NuxtLink>
        <span
          v-else
          class="text-muted text-sm font-medium"
        >{{ cell.row.original.parentName }}</span>
      </template>

      <template #status-cell="{ cell }">
        <div class="flex items-center justify-between gap-6 w-full">
          <NBadge
            :label="getContainerStatusMeta(cell.row.original.status).label"
            :icon="getContainerStatusMeta(cell.row.original.status).icon"
            :badge="getContainerStatusMeta(cell.row.original.status).badge"
            :una="TABLE_BADGE_UNA"
          />
          <NTooltip content="View container details">
            <NButton
              label="i-lucide-file-input"
              icon
              btn="ghost-gray"
              size="xs"
              :to="containerUrl(cell.row.original.slug, 'details')"
            />
          </NTooltip>
        </div>
      </template>

      <template #expanded="{ row }">
        <div class="-m-4 p-4 border-l-18 border-primary-700 dark:border-primary-900">
          <div class="flex justify-center my-3 p-2 bg-gray-100 dark:bg-gray-800">
            <h2 class="text-center text-xl font-semibold tracking-tight">
              {{ row.original.name }} {{ row.original.label ? ` (${row.original.label})` : '' }}
            </h2>
          </div>
          <div class="p-4 text-sm bg-muted/30 rounded-md">
            <div class="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-start">
              <div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                  <IndicatorIconText
                    icon="i-lucide-key-round"
                    label="Identifier"
                    :value="row.original.slug"
                  />
                  <IndicatorIconText
                    :icon="row.original.typeIcon"
                    label="Type"
                    :value="row.original.typeLabel"
                  />
                  <IndicatorIconText
                    icon="i-lucide-tags"
                    label="Classification"
                    :value="row.original.classification"
                  />
                  <div>
                    <div class="flex items-center gap-1.5 mb-0.5">
                      <NIcon
                        :name="getContainerStatusMeta(row.original.status).icon"
                        class="text-primary-400 dark:text-primary-600 text-xs"
                      />
                      <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Status</span>
                    </div>
                    <div class="pl-5">
                      <NBadge
                        :label="getContainerStatusMeta(row.original.status).label"
                        :icon="getContainerStatusMeta(row.original.status).icon"
                        :badge="getContainerStatusMeta(row.original.status).badge"
                      />
                    </div>
                  </div>
                  <IndicatorIconText
                    icon="i-lucide-scan-barcode"
                    label="Barcode"
                    :value="row.original.barcode ?? '—'"
                  />
                  <IndicatorIconText
                    icon="i-lucide-package-open"
                    label="Capacity"
                    :value="row.original.capacityLabel"
                  />
                  <IndicatorIconText
                    icon="i-lucide-boxes"
                    label="Parent"
                  >
                    <NuxtLink
                      v-if="parentUrl(row.original)"
                      :to="parentUrl(row.original)!"
                      class="text-primary-400 dark:text-primary-600 hover:underline font-medium"
                    >
                      {{ row.original.parentName }}
                    </NuxtLink>
                    <span
                      v-else
                      class="font-medium"
                    >{{ row.original.parentName }}</span>
                  </IndicatorIconText>
                  <IndicatorIconText
                    icon="i-lucide-file-badge"
                    label="Template"
                    :value="row.original.templateId ?? '—'"
                  />
                </div>

                <template v-if="row.original.activeFlags.length">
                  <NSeparator class="my-4" />
                  <div class="flex items-center gap-1.5 mb-2">
                    <NIcon
                      name="i-lucide-flag"
                      class="text-primary-400 dark:text-primary-600 text-xs"
                    />
                    <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Flags</span>
                  </div>
                  <div class="flex flex-wrap gap-2 pl-5">
                    <BadgesInventoryFlag
                      v-for="flag in row.original.activeFlags"
                      :key="flag.kind"
                      :flag="flag.kind"
                      :comment="flag.comment"
                    />
                  </div>
                </template>

                <template v-if="row.original.projectRefs.length">
                  <NSeparator class="my-4" />
                  <div class="flex items-center gap-1.5 mb-2">
                    <NIcon
                      name="i-lucide-folder"
                      class="text-primary-400 dark:text-primary-600 text-xs"
                    />
                    <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Projects</span>
                  </div>
                  <div class="flex flex-wrap gap-2 pl-5">
                    <NBadge
                      v-for="ref in row.original.projectRefs"
                      :key="ref.slug"
                      badge="outline"
                      :label="ref.name"
                    />
                  </div>
                </template>

                <template v-if="row.original.description">
                  <NSeparator class="my-4" />
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <NIcon
                      name="i-lucide-file-text"
                      class="text-primary-400 dark:text-primary-600 text-xs"
                    />
                    <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Description</span>
                  </div>
                  <p class="font-medium pl-5">
                    {{ row.original.description }}
                  </p>
                </template>

                <NSeparator class="my-4" />
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <IndicatorIconText
                    icon="i-lucide-calendar-plus"
                    label="Created"
                    :value="formatDate(row.original.createdAt, { includeWeekday: true })"
                  />
                  <IndicatorIconText
                    icon="i-lucide-calendar-check"
                    label="Updated"
                    :value="formatDate(row.original.updatedAt, { includeWeekday: true })"
                  />
                </div>
              </div>

              <div class="flex flex-col items-end flex-shrink-0 gap-2 w-full">
                <NButton
                  label="View contents"
                  btn="soft-primary hover:outline-primary"
                  leading="i-lucide-package-open"
                  :to="containerUrl(row.original.slug, 'contents')"
                  class="w-full"
                />
                <NButton
                  label="View details"
                  btn="soft-primary hover:outline-primary"
                  leading="i-lucide-book-open-text"
                  :to="containerUrl(row.original.slug, 'details')"
                  class="w-full"
                />
                <NButton
                  label="View action log"
                  btn="soft-primary hover:outline-primary"
                  leading="i-lucide-clipboard-clock"
                  :to="containerUrl(row.original.slug, 'log')"
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </NTable>

    <div
      v-if="(table?.getFilteredRowModel().rows.length ?? 0) > 20"
      class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4"
    >
      <div class="flex items-center justify-center text-sm font-medium">
        Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
        {{ table?.getPageCount().toLocaleString() }}
      </div>

      <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 20"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>

    <div
      v-if="selectedContainers.length > 0"
      class="flex flex-wrap items-center justify-between gap-4 px-2 mt-4"
    >
      <div class="flex-1 text-sm text-muted">
        {{ selectedContainers.length }} of
        {{ table?.getFilteredRowModel().rows.length }} container(s) selected.
      </div>
      <div class="flex flex-wrap gap-3 justify-end">
        <DialogAlterContainers
          :containers="selectedContainers"
          @done="clearSelection"
        />
        <DialogLocateContainers
          v-if="allSelectedLost"
          :containers="selectedContainers"
          @done="clearSelection"
        />
        <DialogMoveContainers
          v-if="canMoveSelection"
          :containers="selectedContainers"
          @done="clearSelection"
        />
        <DialogDeleteContainer
          v-if="isAdmin"
          :containers="selectedContainers"
          @done="clearSelection"
        />
      </div>
    </div>
  </div>
</template>
