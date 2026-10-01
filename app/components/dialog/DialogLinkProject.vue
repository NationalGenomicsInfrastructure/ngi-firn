<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { ProjectLinkEntityKind } from '~~/schemas/inventory/projectLinks'
import type { SerializedEntityRef } from '~~/types/inventory'
import { linkEntitiesToProject as useLinkMutation } from '~/utils/mutations/inventory/projectLinks'
import { projectBookmarksQuery } from '~/utils/queries/projects'

export interface LinkableEntity {
  entityKind: ProjectLinkEntityKind
  slug: string
  name: string
  projectRefs: SerializedEntityRef[] | null
}

const props = defineProps<{
  entities: LinkableEntity[]
}>()

const emit = defineEmits<{ done: [] }>()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

// Fixed height keeps the dialog (and the tab bar) from jumping when switching tabs.
const TAB_CONTENT_STYLE = 'pt-4 h-[28rem] max-h-[55vh] overflow-y-auto'

// Anchored to the top instead of centered, so a height change never moves the tab bar.
const DIALOG_CONTENT_STYLE = 'top-[8vh] translate-y-0 max-h-[84vh] overflow-y-auto sm:max-w-2xl'

// Declared first so the search query stays idle until the dialog is opened.
const isOpen = ref(false)

const {
  projectIdPrefixValue,
  setProjectIdPrefixValue,
  projectNameFilterValue,
  setProjectNameFilterValue,
  isLoading,
  isError,
  error,
  responseData,
  scanTruncated,
  scanAtMax,
  retrieveMore,
  onValidating,
  reset
} = useProjectSearch({ enabled: isOpen })
const { linkEntitiesToProject, isLoading: isLinking } = useLinkMutation()

const { state: bookmarksState } = useQuery(projectBookmarksQuery)
const bookmarks = computed(() =>
  bookmarksState.value.status === 'success' ? bookmarksState.value.data : []
)

const selectedProjectId = ref<string | null>(null)
const preferredTab = ref<'bookmarks' | 'search'>('bookmarks')
// Without bookmarks there is only the search.
const activeTab = computed({
  get: () => bookmarks.value.length > 0 ? preferredTab.value : 'search',
  set: (tab: string) => { preferredTab.value = tab as 'bookmarks' | 'search' }
})

const count = computed(() => props.entities.length)
const projects = computed(() => responseData.value?.available ? responseData.value.items : [])

const alreadyLinked = computed(() => selectedProjectId.value
  ? props.entities.filter(entity => entity.projectRefs?.some(ref => ref.slug === selectedProjectId.value)).length
  : 0)
const toLink = computed(() => count.value - alreadyLinked.value)

// A new result set can no longer contain the previous selection, unless it is a bookmark.
watch(projects, (list) => {
  if (
    selectedProjectId.value
    && !list.some(project => project.project_id === selectedProjectId.value)
    && !bookmarks.value.some(bookmark => bookmark.projectId === selectedProjectId.value)
  ) {
    selectedProjectId.value = null
  }
})

async function handleLink() {
  if (!selectedProjectId.value) return
  try {
    await linkEntitiesToProject({
      projectId: selectedProjectId.value,
      entities: props.entities.map(({ entityKind, slug }) => ({ entityKind, slug }))
    })
    isOpen.value = false
    emit('done')
  }
  catch {
    // The mutation surfaces the failure via a toast; keep the dialog open.
  }
}

function onDialogOpenChange(open: boolean) {
  isOpen.value = open
  if (!open) {
    selectedProjectId.value = null
    preferredTab.value = 'bookmarks'
    reset()
  }
}
</script>

<template>
  <NDialog
    :open="isOpen"
    title="Link to project"
    :_dialog-content="{ class: DIALOG_CONTENT_STYLE }"
    description="Associate the selected items and containers with a project from the projects database."
    @update:open="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        :label="count === 1 ? 'Link to Project' : `Link to Project (${count})`"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-folder-kanban"
      />
    </template>

    <div class="p-4 space-y-4">
      <NTabs v-model="activeTab">
        <NTabsList
          v-if="bookmarks.length > 0"
          class="mx-auto"
        >
          <NTabsTrigger value="bookmarks">
            <NIcon name="i-radix-icons-star-filled" />
            Bookmarks ({{ bookmarks.length }})
          </NTabsTrigger>
          <NTabsTrigger value="search">
            <NIcon name="i-lucide-search" />
            Search
          </NTabsTrigger>
        </NTabsList>
        <NTabsContent
          v-if="bookmarks.length > 0"
          value="bookmarks"
          :class="TAB_CONTENT_STYLE"
        >
          <ul
            class="divide-y divide-border rounded-md border border-border"
            role="radiogroup"
            aria-label="Bookmarked projects"
          >
            <li
              v-for="bookmark in bookmarks"
              :key="bookmark.projectId"
            >
              <button
                type="button"
                role="radio"
                :aria-checked="bookmark.projectId === selectedProjectId"
                class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                :class="bookmark.projectId === selectedProjectId ? 'bg-primary-50 dark:bg-primary-950' : ''"
                @click="selectedProjectId = bookmark.projectId"
              >
                <NIcon
                  :name="bookmark.projectId === selectedProjectId ? 'i-lucide-circle-dot' : 'i-lucide-circle'"
                  class="shrink-0"
                />
                <span class="min-w-0 truncate">
                  <span class="font-semibold">{{ bookmark.projectId }}</span>
                  <span
                    v-if="bookmark.projectName"
                    class="text-muted"
                  > · {{ bookmark.projectName }}</span>
                </span>
              </button>
            </li>
          </ul>
        </NTabsContent>
        <NTabsContent
          value="search"
          :class="[TAB_CONTENT_STYLE, 'space-y-4']"
        >
          <form
            class="flex flex-wrap items-end gap-4"
            @submit.prevent="onValidating()"
          >
            <NFormField
              name="ngi_project_id"
              label="Project ID"
              class="min-w-[8rem] flex-1"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <NInput
                :model-value="projectIdPrefixValue ?? ''"
                placeholder="e.g. P12345"
                @update:model-value="(v: unknown) => setProjectIdPrefixValue((v as string) ?? '')"
              />
            </NFormField>
            <NFormField
              name="project_name_filter"
              label="Project name"
              class="min-w-[8rem] flex-1"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <NInput
                :model-value="projectNameFilterValue ?? ''"
                placeholder="e.g. P.Långstrump_45_11"
                @update:model-value="(v: unknown) => setProjectNameFilterValue((v as string) ?? '')"
              />
            </NFormField>
            <NButton
              type="submit"
              label="Search"
              leading="i-lucide-search"
              btn="soft-primary hover:outline-primary"
            />
          </form>

          <NAlert
            v-if="isLoading"
            alert="border-gray"
            title="Loading projects..."
            icon="i-lucide-loader-2"
          />
          <NAlert
            v-else-if="isError"
            alert="border-error"
            title="Error loading projects"
            :description="error != null ? String(error) : 'Something went wrong. Please try again.'"
            icon="i-lucide-alert-circle"
          />
          <NAlert
            v-else-if="responseData && !responseData.available"
            alert="border-warning"
            title="Projects database is not available."
            description="Please try again later."
            icon="i-lucide-database-off"
          />
          <template v-else-if="responseData?.available">
            <p
              v-if="projects.length === 0"
              class="text-sm text-muted"
            >
              No projects match the search.
            </p>
            <ul
              v-else
              class="divide-y divide-border rounded-md border border-border"
              role="radiogroup"
              aria-label="Projects"
            >
              <li
                v-for="project in projects"
                :key="project.project_id"
              >
                <button
                  type="button"
                  role="radio"
                  :aria-checked="project.project_id === selectedProjectId"
                  class="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  :class="project.project_id === selectedProjectId ? 'bg-primary-50 dark:bg-primary-950' : ''"
                  @click="selectedProjectId = project.project_id"
                >
                  <NIcon
                    :name="project.project_id === selectedProjectId ? 'i-lucide-circle-dot' : 'i-lucide-circle'"
                    class="mt-0.5 shrink-0"
                  />
                  <span class="min-w-0">
                    <span class="font-semibold">{{ project.project_id }}</span>
                    <span class="text-muted"> · {{ project.project_name }}</span>
                    <span class="block text-xs text-muted truncate">
                      {{ [project.application, project.status].filter(Boolean).join(' · ') }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
            <div
              v-if="scanTruncated"
              class="flex flex-wrap items-center gap-3 text-sm text-muted"
            >
              <span>
                {{ scanAtMax ? 'There may be more matches than we can scan. Refine the search to see the rest.' : 'More projects may match further down the list.' }}
              </span>
              <NButton
                v-if="!scanAtMax"
                size="sm"
                btn="soft-primary"
                leading="i-lucide-chevrons-down"
                label="Retrieve more"
                @click="retrieveMore()"
              />
            </div>
          </template>
        </NTabsContent>
      </NTabs>

      <p
        v-if="selectedProjectId"
        class="text-sm text-muted"
      >
        <span class="font-semibold">{{ toLink }}</span>
        {{ toLink === 1 ? 'entity' : 'entities' }} will be linked to
        <span class="font-semibold">{{ selectedProjectId }}</span>{{ alreadyLinked > 0 ? `; ${alreadyLinked} already linked.` : '.' }}
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Close"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NButton
          label="Link to project"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-link"
          :loading="isLinking"
          :disabled="!selectedProjectId || toLink === 0"
          @click="handleLink"
        />
      </div>
    </template>
  </NDialog>
</template>
