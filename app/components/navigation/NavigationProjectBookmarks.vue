<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { FirnProjectBookmark } from '~~/types/projects-firn'
import { projectBookmarksQuery } from '~/utils/queries/projects'
import { removeProjectBookmark } from '~/utils/mutations/projects'

defineProps<{
  title: string
}>()

const { isMobile } = useSidebar()

const { state: bookmarksState, asyncStatus: bookmarksAsyncStatus } = useQuery(projectBookmarksQuery)

const bookmarks = computed(() =>
  bookmarksState.value.status === 'success' ? bookmarksState.value.data : []
)

const isLoading = computed(() => bookmarksAsyncStatus.value === 'loading')

const { removeProjectBookmark: removeBookmark, asyncStatus: removeAsyncStatus } = removeProjectBookmark()

const isRemoving = computed(() => removeAsyncStatus.value === 'loading')

function detailsUrl(projectId: string) {
  return `/projects/details/${projectId}`
}

function displayName(bookmark: FirnProjectBookmark) {
  const projectNameFragments = bookmark.projectName?.split(/[_.]/g) ?? []
  if (projectNameFragments.length === 4) {
    return `${projectNameFragments[0]}.${projectNameFragments[1]} ${projectNameFragments[2]}/${projectNameFragments[3]}`
  }
  else {
    return bookmark.projectId
  }
}

function dropdownItems(bookmark: FirnProjectBookmark) {
  return [
    {
      leading: 'i-lucide-trash text-muted',
      label: 'Remove bookmark',
      onClick: () => {
        removeBookmark({
          projectId: bookmark.projectId,
          projectName: bookmark.projectName
        })
      }
    }
  ]
}
</script>

<template>
  <NSidebarGroup class="group-data-[collapsible=icon]:hidden">
    <NSidebarGroupLabel>
      <span class="text-primary-700 dark:text-primary-400 font-semibold">{{ title }}</span>
    </NSidebarGroupLabel>
    <NSidebarMenu>
      <NSidebarMenuItem v-if="isLoading">
        <NSidebarMenuButton
          disabled
          class="text-sidebar-foreground/70"
        >
          <NIcon
            name="i-lucide-loader-circle"
            class="animate-spin text-sidebar-foreground/70"
          />
          <span>Loading bookmarks…</span>
        </NSidebarMenuButton>
      </NSidebarMenuItem>

      <NSidebarMenuItem
        v-else-if="bookmarks.length === 0"
      >
        <NSidebarMenuButton
          disabled
          class="text-sidebar-foreground/70"
        >
          <NIcon
            name="i-radix-icons-star"
            class="text-sidebar-foreground/70"
          />
          <span>No bookmarks yet</span>
        </NSidebarMenuButton>
      </NSidebarMenuItem>

      <NSidebarMenuItem
        v-for="bookmark in bookmarks"
        :key="bookmark.projectId"
        class="min-w-0"
      >
        <NSidebarMenuButton
          as-child
          class="h-auto min-w-0 py-1"
        >
          <NLink
            :to="detailsUrl(bookmark.projectId)"
            class="grid w-full min-w-0 grid-cols-[auto,minmax(0,1fr)] items-start gap-2 pr-8 !whitespace-normal"
          >
            <NIcon
              name="i-radix-icons-star-filled"
              class="shrink-0"
            />
            <span class="block min-w-0 break-words !whitespace-normal leading-4">
              {{ displayName(bookmark) }}
            </span>
          </NLink>
        </NSidebarMenuButton>
        <NDropdownMenu
          :_dropdown-menu-content="{
            side: isMobile ? 'bottom' : 'right',
            align: isMobile ? 'end' : 'start',
            sideOffset: 4
          }"
          :items="dropdownItems(bookmark)"
        >
          <NSidebarMenuAction
            show-on-hover
            :disabled="isRemoving"
          >
            <NIcon
              name="i-lucide-more-horizontal"
              class="text-sidebar-foreground/70"
            />
          </NSidebarMenuAction>
        </NDropdownMenu>
      </NSidebarMenuItem>
    </NSidebarMenu>
  </NSidebarGroup>
</template>
