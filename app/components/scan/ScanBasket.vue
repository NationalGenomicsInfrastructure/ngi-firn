<script setup lang="ts">
import type { BarcodeScanResult } from '~~/types/inventory'
import type { ScanBasket } from '~/composables/useScanBasket'
import { applyBarcodeScan } from '~/utils/mutations/inventory/barcodes'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

/*
 * Scan basket.
 * ***********
 *
 * Scan a set of codes, review what will happen to each, approve once. The server
 * re-resolves the codes on approval, so the result panel is built from the plan it
 * actually executed rather than the one shown for review.
 *
 * Keyboard-wedge safety: a hardware scanner types each code and presses Enter into
 * whatever element has focus. No button here takes focus, the reader field is
 * refocused after every tap, and Approve ignores keyboard-originated clicks, so a
 * scan can never apply the basket by accident.
 */

const props = defineProps<{
  basket: ScanBasket
}>()

const scanner = useTemplateRef<{ focus: () => void }>('scanner')

function refocus() {
  nextTick(() => scanner.value?.focus())
}

const { mutateAsync: applyScan, asyncStatus: applyStatus } = applyBarcodeScan()
const isApplying = computed(() => applyStatus.value === 'loading')

const lastResult = ref<BarcodeScanResult | null>(null)

function onScanned(code: string) {
  lastResult.value = null
  props.basket.addCode(code)
}

function onRemove(code: string) {
  props.basket.removeCode(code)
  refocus()
}

function onActionChange(value: Parameters<ScanBasket['setAction']>[0]) {
  props.basket.setAction(value)
  refocus()
}

const canApprove = computed(() =>
  !isApplying.value
  && !props.basket.isResolving.value
  && props.basket.plan.value !== null
  && !props.basket.plan.value.error
  && props.basket.executableCount.value > 0)

const approveLabel = computed(() => {
  if (isApplying.value) return 'Applying…'
  const count = props.basket.executableCount.value
  const blocked = props.basket.blockedCount.value
  const base = `Apply ${count}`
  return blocked > 0 ? `${base} · ${blocked} blocked` : base
})

async function onApprove(event: MouseEvent) {
  // A click with detail 0 came from the keyboard (Enter/Space), not a finger or mouse.
  if (event.detail === 0 || !canApprove.value) return refocus()

  const codes = [...props.basket.resolvedCodes.value]
  try {
    const result = await applyScan({ codes, logComment: props.basket.logComment.value.trim() || null })
    lastResult.value = result

    // Drop what was applied; keep failures and blocked targets for another look.
    const appliedSlugs = new Set(result.applied.flatMap(group => group.slugs))
    if (appliedSlugs.size > 0 && result.failures.length === 0 && result.plan.targets.every(t => appliedSlugs.has(t.slug))) {
      props.basket.clear()
    }
    else {
      for (const target of result.plan.targets) {
        if (appliedSlugs.has(target.slug)) props.basket.removeCode(target.code)
      }
    }
  }
  catch {
    // The mutation already reports the error as a toast; the basket stays as it was.
  }
  finally {
    refocus()
  }
}

/* Clearing needs a second tap: confirm() is not an option and a stray tap is costly. */
const confirmingClear = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

function onClear(event: MouseEvent) {
  // Same guard as Approve: a wedge scanner's Enter must never wipe the basket.
  if (event.detail === 0) return refocus()

  if (!confirmingClear.value) {
    confirmingClear.value = true
    confirmTimer = setTimeout(() => {
      confirmingClear.value = false
    }, 3000)
  }
  else {
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmingClear.value = false
    props.basket.clear()
    lastResult.value = null
  }
  refocus()
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})

const resultSummary = computed(() => {
  const result = lastResult.value
  if (!result) return null
  const nameOf = new Map(result.plan.targets.map(t => [t.slug, t.name]))
  return {
    applied: result.applied.map(group => ({
      label: getActionTypeMeta(group.action).label,
      names: group.slugs.map(slug => nameOf.get(slug) ?? slug)
    })),
    failures: result.failures.map(f => ({ name: nameOf.get(f.slug) ?? f.slug, error: f.error })),
    error: result.plan.error
  }
})

function warningsFor(code: string) {
  const role = props.basket.roleOf(code)
  if (role.kind !== 'target') return []
  return props.basket.plan.value?.warnings.filter(w => w.slug === role.target.slug) ?? []
}
</script>

<template>
  <div class="space-y-5">

    <ScanActionPicker
      :model-value="basket.action.value"
      @update:model-value="onActionChange"
    />

    <BarcodeInventoryScanner
      ref="scanner"
      large
      continuous
      clear-on-scan
      placeholder="Scan items, containers, locations or an action card"
      @scanned="onScanned"
    />
    <!-- Outcome of the last approval -->
    <NCard
      v-if="resultSummary"
      card="outline-gray"
      :_card-content="{ class: 'space-y-2 py-4 text-sm' }"
    >
      <p class="flex items-center gap-2 font-semibold">
        <NIcon name="i-lucide-clipboard-check" />
        Last applied
      </p>
      <p
        v-if="resultSummary.error"
        class="text-error-700 dark:text-error-300"
      >
        {{ resultSummary.error }}
      </p>
      <p
        v-for="group in resultSummary.applied"
        :key="group.label"
      >
        <span class="font-medium">{{ group.label }}:</span> {{ group.names.join(', ') }}
      </p>
      <p
        v-for="failure in resultSummary.failures"
        :key="failure.name"
        class="text-error-700 dark:text-error-300"
      >
        <span class="font-medium">{{ failure.name }}:</span> {{ failure.error }}
      </p>
    </NCard>

    <template v-if="basket.entityCodes.value.length > 0">
      <ScanBasketSummary
        :action="basket.action.value"
        :plan="basket.plan.value"
        :executable-count="basket.executableCount.value"
        :relocating="basket.relocating.value"
      />

      <NAlert
        v-if="basket.planError.value"
        alert="soft-error"
        title="The basket could not be resolved"
        :description="basket.planError.value.message"
        icon="i-lucide-alert-circle"
      />

      <ul class="space-y-2">
        <ScanBasketRow
          v-for="code in basket.entityCodes.value"
          :key="code"
          :code="code"
          :role="basket.roleOf(code)"
          :warnings="warningsFor(code)"
          @remove="onRemove"
        />
      </ul>
    </template>

    <div
      v-else
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-muted"
    >
      <NIcon
        name="i-lucide-shopping-basket"
        class="text-4xl"
      />
      <p class="font-medium">
        The basket is empty
      </p>
      <p class="text-sm">
        Scan what you are handling. Without an action, items are checked out or returned.
      </p>
    </div>

    <!-- Sticky approval bar -->
    <div
      class="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-gray-200 dark:border-gray-800 bg-background/95 backdrop-blur px-4 pt-3"
      style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
    >
      <NInput
        :model-value="basket.logComment.value"
        leading="i-lucide-message-square"
        placeholder="Optional note for the action log"
        size="lg"
        :una="{ inputWrapper: 'w-full' }"
        @update:model-value="basket.setLogComment($event ?? '')"
        @keydown.enter.prevent="refocus()"
      />
      <div class="flex gap-2">
        <NButton
          :btn="confirmingClear ? 'solid-error' : 'soft-gray hover:outline-error'"
          size="xl"
          :leading="confirmingClear ? 'i-lucide-triangle-alert' : 'i-lucide-trash-2'"
          :label="confirmingClear ? 'Tap again' : 'Clear'"
          class="min-h-16 shrink-0"
          :disabled="basket.entityCodes.value.length === 0 && !basket.action.value"
          @mousedown.prevent
          @click="onClear"
        />
        <NButton
          btn="solid-success"
          size="xl"
          :leading="isApplying ? 'i-lucide-loader-2' : 'i-lucide-check-check'"
          :label="approveLabel"
          class="min-h-16 flex-1 text-lg font-semibold"
          :disabled="!canApprove"
          @mousedown.prevent
          @click="onApprove"
        />
      </div>
    </div>
  </div>
</template>
