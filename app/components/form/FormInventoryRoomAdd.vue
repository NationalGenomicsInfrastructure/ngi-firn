<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import type { CreateRoomSchemaInput } from '~~/schemas/inventory-locations'
import { createRoomSchema } from '~~/schemas/inventory-locations'
import { createRoom } from '~/utils/mutations/inventory/rooms'
import {
  BUILDING_OPTIONS,
  ROOM_FORM_LABEL_STYLE,
  ROOM_TYPE_OPTIONS,
  buildGeneratedRoomId,
  createEmptyRoomFormValues,
  focusFirstFormFieldError,
  mapRoomFormValuesToCreatePayload,
  resolveBuildingFromSelect,
  resolveFloorFromInput,
  resolveRoomTypeFromSelect
} from '~/utils/inventory/rooms'

const { showError } = useFirnToast()
const toastActions = [
  {
    label: 'Retry',
    btn: 'solid-primary',
    altText: 'Error',
    onClick: () => {
      onSubmit()
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

const formSchema = toTypedSchema(createRoomSchema)

const { handleSubmit, validate, errors, resetForm } = useForm({
  validationSchema: formSchema,
  initialValues: createEmptyRoomFormValues()
})

const { value: roomTypeValue, setValue: setRoomTypeValue } = useField<CreateRoomSchemaInput['roomType']>('roomType')
const { value: buildingValue, setValue: setBuildingValue } = useField<CreateRoomSchemaInput['building']>('building')
const { value: roomNumberValue } = useField<string>('roomNumber')
const { value: floorValue, setValue: setFloorValue } = useField<number | undefined>('floor')

const floorInputValue = computed(() => floorValue.value == null ? '' : String(floorValue.value))
const generatedRoomId = computed(() =>
  buildGeneratedRoomId(buildingValue.value, floorValue.value, roomNumberValue.value)
)

function onRoomTypeUpdate(value: unknown) {
  const resolved = resolveRoomTypeFromSelect(value)
  if (resolved) {
    setRoomTypeValue(resolved)
  }
}

function onBuildingUpdate(value: unknown) {
  const resolved = resolveBuildingFromSelect(value)
  if (resolved) {
    setBuildingValue(resolved)
  }
}

function onFloorUpdate(value: unknown) {
  setFloorValue(resolveFloorFromInput(value))
}

const onSubmit = handleSubmit(async (values) => {
  const payload = mapRoomFormValuesToCreatePayload(values)

  try {
    const { mutateAsync } = createRoom()
    const result = await mutateAsync(payload)
    if (result) {
      resetForm()
    }
    else {
      showError(`Room "${payload.name}" could not be created.`, 'Room creation error', { actions: toastActions })
    }
  }
  catch (error) {
    showError(`Room "${payload.name}" could not be created: ${error}`, 'Room creation error', { actions: toastActions })
  }
})

async function onValidating() {
  await validate()
  await focusFirstFormFieldError(errors.value)
  onSubmit()
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
          :model-value="roomTypeValue"
          :items="ROOM_TYPE_OPTIONS"
          by="value"
          @update:model-value="onRoomTypeUpdate"
        />
      </NFormField>

      <NFormField
        name="building"
        label="Campus Solna Building"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NSelect
          :model-value="buildingValue"
          :items="BUILDING_OPTIONS"
          by="value"
          @update:model-value="onBuildingUpdate"
        />
      </NFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <NFormField
        name="roomNumber"
        label="Room number"
        :una="{ formLabel: ROOM_FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. A3590" />
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
          :model-value="floorInputValue"
          type="number"
          step="1"
          placeholder="e.g. -1, 0, 3"
          @update:model-value="onFloorUpdate"
        />
      </NFormField>
    </div>

    <NFormField
      name="generatedRoomId"
      label="Room identifier"
      description="Automatically created from building, floor, and room number."
      :una="{
        formLabel: ROOM_FORM_LABEL_STYLE,
        formDescription: 'text-muted'
      }"
    >
      <NInput
        :model-value="generatedRoomId"
        placeholder="e.g. alfa-3-G23"
        disabled
      />
    </NFormField>

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
