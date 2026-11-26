<script setup lang="ts">
/*
 * A button that asks for confirmation before running an action. The dialog stays open while the
 * action runs and when it fails; reporting the failure is the action's job.
 */
const props = withDefaults(defineProps<{
  title: string
  description: string
  triggerLabel: string
  confirmLabel: string
  icon: string
  /* UnaUI button variants. */
  triggerBtn?: string
  confirmBtn?: string
  loading?: boolean
  disabled?: boolean
  /* Performs the confirmed action; a rejected promise keeps the dialog open. */
  action: () => Promise<unknown>
}>(), {
  triggerBtn: 'soft-gray hover:outline-gray',
  confirmBtn: 'solid-primary',
  loading: false,
  disabled: false
})

const isOpen = ref(false)

async function confirm() {
  try {
    await props.action()
    isOpen.value = false
  }
  catch {
    // Already reported by the action. Keep the dialog open for another try.
  }
}
</script>

<template>
  <NDialog
    :open="isOpen"
    :title="title"
    :description="description"
    @update:open="isOpen = $event"
  >
    <template #trigger>
      <NButton
        size="sm"
        :btn="triggerBtn"
        :leading="icon"
        :label="triggerLabel"
        :disabled="disabled"
      />
    </template>

    <template #footer>
      <div class="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <!-- Not "Cancel": that is what one of the confirmed actions is called. -->
        <NDialogClose>
          <NButton
            label="Go back"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-arrow-left"
          />
        </NDialogClose>
        <NButton
          :label="confirmLabel"
          :btn="confirmBtn"
          :leading="icon"
          :loading="loading"
          :disabled="disabled"
          @click="confirm"
        />
      </div>
    </template>
  </NDialog>
</template>
