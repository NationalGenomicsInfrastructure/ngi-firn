<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createRoomSchema } from '~~/schemas/inventory/rooms'
import type { CreateRoomInput } from '~~/schemas/inventory/rooms'
import { createRoom } from '~/utils/mutations/inventory/rooms'
import {
  BUILDING_OPTIONS,
  ROOM_FORM_LABEL_STYLE,
  ROOM_TYPE_OPTIONS,
  focusFirstFormFieldError
} from '~/utils/inventory/room'

const { showError } = useFirnToast()

const formSchema = toTypedSchema(createRoomSchema)

const initialValues: Partial<CreateRoomInput> = {
  name: '',
  label: '',
  roomType: 'Laboratory',
  building: 'Alfa',
  roomNumber: undefined,
  floor: undefined,
  description: '',
  isActive: true
}

const { handleSubmit, errors, resetForm } = useForm({
  validationSchema: formSchema,
  initialValues
})

const toastActions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      void onSubmit()
    }
  },
  {
    label: 'Dismiss',
    btn: 'solid-white',
    altText: 'Error',
    onClick: () => {
      resetForm({ values: { ...initialValues } })
    }
  }
]

const onSubmit = handleSubmit(
  async (values) => {
    const payload = {
      ...values,
      label: values.label?.trim() || null,
      description: values.description?.trim() || null
    }

    try {
      const { mutateAsync } = createRoom()
      const result = await mutateAsync(payload)
      if (result) {
        resetForm({ values: { ...initialValues } })
      }
      else {
        showError(`Room "${payload.name}" could not be created.`, 'Room creation error', { actions: toastActions })
      }
    }
    catch (error) {
      showError(`Room "${payload.name}" could not be created: ${error}`, 'Room creation error', { actions: toastActions })
    }
  },
  async () => {
    await focusFirstFormFieldError(errors.value)
    showError('Please correct the highlighted fields before creating a room.', 'Could not create room')
  }
)

async function onValidating() {
  await onSubmit()
}
</script>

<template>
  <form
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
          placeholder="590"
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
          placeholder="1"
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
        type="submit"
        btn="soft-success hover:outline-success"
        leading="i-lucide-house-plus"
        class="w-full my-4"
      >
        Create room
      </NButton>
    </div>
  </form>
</template>
