<script setup lang="ts">
import type { DisplayTaskStep } from '~~/types/productivity'
import type { TaskStepState } from '~~/schemas/tasks/enums'
import { getContainerStatusMeta } from '~/utils/inventory/container'
import { entityKindIcon, entityRoute } from '~/utils/inventory/entity'

/*
 * What a step asks for: a free-text to-do, or an inventory action on a target (expected status →
 * action, as in the scan basket). The left border carries the step's state.
 */

const props = defineProps<{
  step: DisplayTaskStep
  /* Checklist numbers of the prerequisite steps. */
  after: number[]
}>()

const payload = computed(() => props.step.payload)
const expectedStatusMeta = computed(() =>
  payload.value.kind === 'inventory' && payload.value.expectedStatus
    ? getContainerStatusMeta(payload.value.expectedStatus)
    : null
)
const note = computed(() => payload.value.kind === 'text' ? payload.value.body : payload.value.notes)

const STATE_BORDER_STYLE: Record<TaskStepState, string> = {
  completed: 'border-l-success-500',
  skipped: 'border-l-yellow-400',
  executing: 'border-l-primary-500',
  needs_reconciliation: 'border-l-error-500',
  held: 'border-l-indigo-500',
  planned: 'border-l-gray-300 dark:border-l-gray-700',
  cancelled: 'border-l-gray-200 dark:border-l-gray-800 opacity-60'
}
</script>

<template>
  <div
    class="flex items-start gap-3 border-l-4 pl-3"
    :class="STATE_BORDER_STYLE[step.state]"
  >
    <NIcon
      :name="payload.kind === 'text' ? 'i-lucide-list-todo' : entityKindIcon(payload.target.entity.kind)"
      class="mt-0.5 text-xl shrink-0 text-primary-600 dark:text-primary-400"
    />
    <div class="min-w-0 space-y-1">
      <p
        v-if="payload.kind === 'text'"
        class="font-semibold break-words"
      >
        {{ payload.title }}
      </p>
      <template v-else>
        <NLink
          :to="entityRoute(payload.target.entity) ?? undefined"
          class="block font-semibold break-words text-primary-700 dark:text-primary-400 hover:underline"
        >
          {{ payload.target.entity.name }}
        </NLink>
        <p class="font-mono text-xs text-muted break-all">
          {{ payload.target.entity.slug }}
        </p>
        <div class="flex flex-wrap items-center gap-1.5">
          <template v-if="expectedStatusMeta">
            <NBadge
              :label="expectedStatusMeta.label"
              :icon="expectedStatusMeta.icon"
              :badge="expectedStatusMeta.badge"
              title="Expected status before this step"
            />
            <NIcon
              name="i-lucide-arrow-right"
              class="text-muted"
            />
          </template>
          <BadgesInventoryAction
            :action-type="payload.action"
            :tense="step.state === 'completed' ? 'past' : 'imperative'"
          />
        </div>
      </template>
      <p
        v-if="note"
        class="text-sm text-muted whitespace-pre-line break-words"
      >
        {{ note }}
      </p>
      <p
        v-if="after.length"
        class="flex items-center gap-1.5 text-xs text-muted"
      >
        <NIcon name="i-lucide-corner-down-right" />
        After {{ after.map(number => `#${number}`).join(', ') }}
      </p>
    </div>
  </div>
</template>
