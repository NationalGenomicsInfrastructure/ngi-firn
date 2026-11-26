<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'

/*
 * Pickers for the people of a task: responsible users and viewers. Mirrors the server's sharing
 * rules, so that what is shown is what gets stored: nobody is listed twice (responsibility wins
 * over viewing) and excluded users, i.e. the managing owner, cannot be picked.
 */
const props = withDefaults(defineProps<{
  responsible: DisplayUserToUsers[]
  viewers: DisplayUserToUsers[]
  excludeFirnIds?: string[]
  responsibleEmptyText?: string
}>(), {
  excludeFirnIds: () => [],
  responsibleEmptyText: 'Nobody assigned yet.'
})

const emit = defineEmits<{
  'update:responsible': [users: DisplayUserToUsers[]]
  'update:viewers': [users: DisplayUserToUsers[]]
}>()

const responsibleIds = computed(() => props.responsible.map(user => user.firnId))
const unavailableAsResponsible = computed(() => [...props.excludeFirnIds, ...responsibleIds.value])
// A responsible user already has access, so they are not offered as a viewer either.
const unavailableAsViewer = computed(() =>
  [...unavailableAsResponsible.value, ...props.viewers.map(user => user.firnId)]
)

function addResponsible(user: DisplayUserToUsers | undefined) {
  if (!user || unavailableAsResponsible.value.includes(user.firnId)) return
  emit('update:responsible', [...props.responsible, user])
  // Promoting a viewer moves them over.
  if (props.viewers.some(viewer => viewer.firnId === user.firnId)) {
    emit('update:viewers', props.viewers.filter(viewer => viewer.firnId !== user.firnId))
  }
}

function addViewer(user: DisplayUserToUsers | undefined) {
  if (!user || unavailableAsViewer.value.includes(user.firnId)) return
  emit('update:viewers', [...props.viewers, user])
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <p :class="UI_LABEL_STYLE">
        Responsible users
      </p>
      <SelectFirnUsers
        :exclude-firn-ids="unavailableAsResponsible"
        @update:model-value="addResponsible"
      />
      <ListFirnUsers
        :model-value="responsible"
        :empty-text="responsibleEmptyText"
        noun="responsible users"
        @update:model-value="emit('update:responsible', $event)"
      />
    </div>

    <div class="space-y-2">
      <p :class="UI_LABEL_STYLE">
        Viewers
      </p>
      <SelectFirnUsers
        :exclude-firn-ids="unavailableAsViewer"
        @update:model-value="addViewer"
      />
      <ListFirnUsers
        :model-value="viewers"
        empty-text="No additional viewers."
        noun="viewers"
        @update:model-value="emit('update:viewers', $event)"
      />
    </div>
  </div>
</template>
