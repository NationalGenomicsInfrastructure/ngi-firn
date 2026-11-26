<script setup lang="ts">
import type { DisplayTaskStep } from '~~/types/productivity'
import type { TaskInventoryAction } from '~~/schemas/tasks/enums'
import type { GridPosition } from '~~/types/inventory'
import { entityKindIcon, entityRoute } from '~/utils/inventory/entity'
import { gridLabel } from '~/utils/inventory/grid'

/*
 * Where a step happens: origin and destination of an inventory action, or the context references of
 * a to-do. The target's path names its ancestors only; the destination's path ends with the
 * destination itself. A finished step keeps the places recorded when it was planned.
 */

const props = defineProps<{
  step: DisplayTaskStep
}>()

const payload = computed(() => props.step.payload)

const ORIGIN_LABELS: Record<TaskInventoryAction, string> = {
  checkout: 'In',
  return: 'In',
  move: 'From',
  locate: 'Last seen in',
  dispose: 'In'
}

function slotLabel(position: GridPosition) {
  return position.label || gridLabel(position.row, position.column, position.level)
}
</script>

<template>
  <template v-if="payload.kind === 'text'">
    <ul
      v-if="payload.contextRefs?.length"
      class="space-y-1 text-sm"
    >
      <li
        v-for="context in payload.contextRefs"
        :key="`${context.kind}:${context.slug}`"
      >
        <NLink
          :to="entityRoute(context) ?? undefined"
          class="inline-flex items-start gap-1.5 font-medium text-primary-700 dark:text-primary-400 hover:underline"
        >
          <NIcon
            :name="entityKindIcon(context.kind)"
            class="mt-0.5 shrink-0 text-muted"
          />
          <span class="break-words">{{ context.name }}</span>
        </NLink>
      </li>
    </ul>
    <span
      v-else
      class="text-muted"
    >—</span>
  </template>

  <dl
    v-else
    class="space-y-2 text-sm"
  >
    <div>
      <dt class="text-xs text-muted">
        {{ ORIGIN_LABELS[payload.action] }}
      </dt>
      <dd class="font-medium break-words">
        {{ payload.target.pathLabel || '—' }}
      </dd>
    </div>
    <div v-if="payload.destination">
      <dt class="text-xs text-muted">
        To
      </dt>
      <dd class="flex flex-wrap items-center gap-x-1.5 gap-y-1 break-words">
        <NLink
          :to="entityRoute(payload.destination.parent.entity) ?? undefined"
          class="font-medium text-primary-700 dark:text-primary-400 hover:underline"
        >
          {{ payload.destination.parent.pathLabel || payload.destination.parent.entity.name }}
        </NLink>
        <NBadge
          v-if="payload.destination.position"
          badge="outline"
          :label="`Slot ${slotLabel(payload.destination.position)}`"
        />
      </dd>
    </div>
  </dl>
</template>
