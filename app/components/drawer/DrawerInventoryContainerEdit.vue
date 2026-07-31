<script setup lang="ts">
import type { DisplayContainer } from '~~/types/inventory'

const props = defineProps<{
  container: DisplayContainer
}>()

const isDrawerOpen = ref(false)
const formId = computed(() => `inventory-container-edit-${props.container.slug}`)

function onSaved() {
  isDrawerOpen.value = false
}
</script>

<template>
  <NDrawer
    v-model:open="isDrawerOpen"
    direction="right"
    scrollable
  >
    <NDrawerTrigger as-child>
      <NButton
        label="Edit"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-pencil"
      />
    </NDrawerTrigger>

    <NDrawerContent class="!w-[80vw] !max-w-[80vw]">
      <NDrawerHeader>
        <NDrawerTitle>Edit container</NDrawerTitle>
        <NDrawerDescription>
          Update this container's classification, labels and capacity.
        </NDrawerDescription>
      </NDrawerHeader>

      <div class="w-full overflow-y-auto">
        <FormInventoryContainerEdit
          :container="container"
          :form-id="formId"
          hide-submit
          @saved="onSaved"
        />
      </div>

      <NDrawerFooter>
        <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
          <NDrawerClose as-child>
            <NButton
              label="Cancel"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-x"
            />
          </NDrawerClose>
          <NButton
            type="submit"
            :form="formId"
            label="Save changes"
            btn="soft-success hover:outline-success"
            trailing="i-lucide-check"
          />
        </div>
      </NDrawerFooter>
    </NDrawerContent>
  </NDrawer>
</template>
