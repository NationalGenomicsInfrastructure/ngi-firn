<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { projectBookmarksQuery } from '~/utils/queries/projects'
import { addProjectBookmark, removeProjectBookmark } from '~/utils/mutations/projects'

const props = withDefaults(defineProps<{
  projectId: string
  projectName?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'solid' | 'ghost'
  class?: string
  showTooltip?: boolean
}>(), {
  size: 'md',
  variant: 'solid',
  showTooltip: true
})

// Ensures UnaUI's extractor includes these toggle variant selectors in the CSS bundle.
const __bookmarkToggleVariants = {
  toggleOn: 'solid-primary ghost-primary',
  toggleOff: 'ghost-gray'
}

const { state: bookmarksState, asyncStatus: bookmarksAsyncStatus } = useQuery(projectBookmarksQuery)

const bookmarks = computed(() =>
  bookmarksState.value.status === 'success' ? bookmarksState.value.data : []
)

const isBookmarked = computed(() =>
  bookmarks.value.some(b => b.projectId === props.projectId)
)

const { addProjectBookmark: addBookmark, asyncStatus: addAsyncStatus } = addProjectBookmark()
const { removeProjectBookmark: removeBookmark, asyncStatus: removeAsyncStatus } = removeProjectBookmark()

const isPending = computed(() =>
  bookmarksAsyncStatus.value === 'loading'
  || addAsyncStatus.value === 'loading'
  || removeAsyncStatus.value === 'loading'
)

const toggle = computed({
  get: () => isBookmarked.value,
  set(value: boolean) {
    if (value) {
      addBookmark({ projectId: props.projectId })
    }
    else {
      removeBookmark({
        projectId: props.projectId,
        ...(props.projectName !== undefined && { projectName: props.projectName })
      })
    }
  }
})

const toggleState = computed(() => toggle.value ? 'on' : 'off')

const tooltipContent = computed(() =>
  toggle.value ? 'Remove bookmark' : 'Bookmark project'
)

function handleClick() {
  toggle.value = !toggle.value
}
</script>

<template>
  <NTooltip
    v-if="showTooltip"
    :content="tooltipContent"
  >
    <NButton
      v-if="variant === 'solid'"
      type="button"
      icon
      toggle-on="solid-primary"
      toggle-off="ghost-gray"
      :data-state="toggleState"
      :label="toggle ? 'i-radix-icons-star-filled' : 'i-radix-icons-star'"
      :size="size"
      :disabled="isPending"
      :class="props.class"
      aria-label="Bookmark project"
      @click="handleClick"
    />
    <NButton
      v-else
      type="button"
      icon
      toggle-on="ghost-primary"
      toggle-off="ghost-gray"
      :data-state="toggleState"
      :label="toggle ? 'i-radix-icons-star-filled' : 'i-radix-icons-star'"
      :size="size"
      :disabled="isPending"
      :class="props.class"
      aria-label="Bookmark project"
      @click="handleClick"
    />
  </NTooltip>

  <template v-else>
    <NButton
      v-if="variant === 'solid'"
      type="button"
      icon
      toggle-on="solid-primary"
      toggle-off="ghost-gray"
      :data-state="toggleState"
      :label="toggle ? 'i-radix-icons-star-filled' : 'i-radix-icons-star'"
      :size="size"
      :disabled="isPending"
      :class="props.class"
      aria-label="Bookmark project"
      @click="handleClick"
    />
    <NButton
      v-else
      type="button"
      icon
      toggle-on="ghost-primary"
      toggle-off="ghost-gray"
      :data-state="toggleState"
      :label="toggle ? 'i-radix-icons-star-filled' : 'i-radix-icons-star'"
      :size="size"
      :disabled="isPending"
      :class="props.class"
      aria-label="Bookmark project"
      @click="handleClick"
    />
  </template>
</template>
