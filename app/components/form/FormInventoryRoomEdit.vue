<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { updateRoomSchema } from '~~/schemas/inventory/rooms'
import type { Room } from '~~/types/inventory'
import { updateRoom } from '~/utils/mutations/inventory/rooms'
import {
  BUILDING_OPTIONS,
  ROOM_EDIT_FORM_ID_PREFIX,
  ROOM_FORM_LABEL_STYLE,
  ROOM_TYPE_OPTIONS,
  focusFirstFormFieldError
} from '~/utils/inventory/room'

const props = defineProps<{
  room: Room
  hideSubmit?: boolean
  formId?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const formElementId = computed(() => props.formId ?? `${ROOM_EDIT_FORM_ID_PREFIX}${props.room._id}`)

const { showError } = useFirnToast()
const toastActions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      void onValidating()
    }
  },
  {
    label: 'Dismiss',
    btn: 'solid-white',
    altText: 'Error',
    onClick: () => {
      resetForm()
    }
  }
]

const formSchema = toTypedSchema(updateRoomSchema)

const { handleSubmit, errors, resetForm } = useForm({
  validationSchema: formSchema,
  initialValues: {
    slug: props.room.slug,
    name: props.room.name,
    label: props.room.label ?? '',
    roomType: props.room.roomType,
    building: props.room.building,
    roomNumber: props.room.roomNumber ?? undefined,
    floor: props.room.floor ?? undefined,
    description: props.room.description ?? '',
    isActive: props.room.isActive
  }
})

const onSubmit = handleSubmit(
  async (values) => {
    try {
      const { mutateAsync } = updateRoom()
      const result = await mutateAsync(values)
      if (!result) {
        showError(`Room "${values.name}" could not be updated.`, 'Room update error', { actions: toastActions })
        return
      }

      emit('saved')
    }
    catch (error) {
      showError(`Room "${values.name}" could not be updated: ${error}`, 'Room update error', { actions: toastActions })
    }
  },
  async () => {
    await focusFirstFormFieldError(errors.value)
    showError('Please correct the highlighted fields before saving.', 'Could not save room')
  }
)

async function onValidating() {
  await onSubmit()
}
</script>

<template>
  <form
    :id="formElementId"
    class="mx-auto max-w-xl p-4 space-y-4"
    @submit.prevent="onValidating()"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="name"
        label="Room name"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. Big Lab" />
      </NFormField>
      <NFormField
        name="label"
        label="Custom label"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="" />
      </NFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="roomType"
        label="Room type"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :items="ROOM_TYPE_OPTIONS"
          by="value"
        />
      </NFormField>

      <NFormField
        name="building"
        label="Campus Solna Building"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :items="BUILDING_OPTIONS"
          by="value"
        />
      </NFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <NFormField
        name="roomNumber"
        label="Room number"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NInput
          type="number"
          step="1"
          placeholder="e.g. 590"
        />
      </NFormField>

      <NFormField
        name="floor"
        label="Floor"
        :una="{
          formLabel: ROOM_FORM_LABEL_STYLE,
          formDescription: 'text-muted'
        }"
      >
        <NInput
          type="number"
          step="1"
          placeholder="e.g. -1, 0, 3"
        />
      </NFormField>
    </div>

    <NFormField
      name="description"
      label="Description"
      :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
    >
      <NInput
        type="textarea"
        :rows="3"
        placeholder="Optional room notes"
      />
    </NFormField>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <NFormField
        name="isActive"
        label="Status"
        :una="{
          formLabel: ROOM_FORM_LABEL_STYLE,
          formDescription: 'text-muted'
        }"
      >
        <NCheckbox label="Active?" />
      </NFormField>

      <NButton
        v-if="!hideSubmit"
        type="submit"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-pencil"
        class="w-full my-4"
      >
        Save changes
      </NButton>
    </div>
  </form>
</template>
