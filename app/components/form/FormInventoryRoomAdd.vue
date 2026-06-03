<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import type { CreateRoomSchemaInput } from '~~/schemas/inventory-locations'
import { createRoomSchema } from '~~/schemas/inventory-locations'
import { createRoom } from '~/utils/mutations/inventory/rooms'

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

const ROOM_TYPE_OPTIONS: Array<{ label: string, value: CreateRoomSchemaInput['roomType'] }> = [
  { label: 'Laboratory', value: 'laboratory' },
  { label: 'Storage', value: 'storage' },
  { label: 'Basement', value: 'basement' },
  { label: 'Office', value: 'office' },
  { label: 'Other', value: 'other' }
]

const BUILDING_OPTIONS: Array<{ label: string, value: CreateRoomSchemaInput['building'] }> = [
  { label: 'Alfa', value: 'alfa' },
  { label: 'Beta', value: 'beta' },
  { label: 'Gamma', value: 'gamma' },
  { label: 'Delta', value: 'delta' }
]

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
  initialValues: {
    name: '',
    label: '',
    roomNumber: '',
    roomType: 'laboratory' as const,
    building: 'alfa' as const,
    floor: undefined as number | undefined,
    description: '',
    isActive: true
  }
})

const { value: roomTypeValue, setValue: setRoomTypeValue } = useField<CreateRoomSchemaInput['roomType']>('roomType')
const { value: buildingValue, setValue: setBuildingValue } = useField<CreateRoomSchemaInput['building']>('building')
const { value: roomNumberValue } = useField<string>('roomNumber')
const { value: floorValue, setValue: setFloorValue } = useField<number | undefined>('floor')

const floorInputValue = computed(() => floorValue.value == null ? '' : String(floorValue.value))
const generatedRoomId = computed(() => {
  if (buildingValue.value == null || floorValue.value == null) {
    return ''
  }

  const normalizedRoomNumber = roomNumberValue.value?.trim().replace(/\s+/g, '') ?? ''
  if (normalizedRoomNumber.length === 0) {
    return ''
  }

  return `${buildingValue.value}-${floorValue.value}-${normalizedRoomNumber}`
})

function onRoomTypeUpdate(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    return
  }

  const option = ROOM_TYPE_OPTIONS.find(item => item.value === value)
  if (option) {
    setRoomTypeValue(option.value)
  }
}

function onBuildingUpdate(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    return
  }

  const option = BUILDING_OPTIONS.find(item => item.value === value)
  if (option) {
    setBuildingValue(option.value)
  }
}

function onFloorUpdate(value: unknown) {
  if (value == null || value === '') {
    setFloorValue(undefined)
    return
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    setFloorValue(undefined)
    return
  }

  setFloorValue(parsed)
}

const onSubmit = handleSubmit(async (values) => {
  const payload: CreateRoomSchemaInput = {
    name: values.name.trim(),
    label: values.label?.trim() ?? undefined,
    roomNumber: values.roomNumber.trim(),
    roomType: values.roomType,
    building: values.building,
    floor: values.floor,
    description: values.description?.trim() ? values.description.trim() : undefined,
    isActive: values.isActive
  }

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

  const firstErrorField = Object.keys(errors.value)[0]
  if (firstErrorField) {
    const firstErrorFieldElement = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement
    if (firstErrorFieldElement) {
      firstErrorFieldElement.focus()
      firstErrorFieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

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
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. NovaSeq freezer room" />
      </NFormField>
      <NFormField
        name="label"
        label="Label"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. NSQ-RM-01" />
      </NFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NFormField
        name="roomType"
        label="Room type"
        :una="{ formLabel: FORM_LABEL_STYLE }"
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
        label="Building"
        :una="{ formLabel: FORM_LABEL_STYLE }"
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
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NInput placeholder="e.g. G312" />
      </NFormField>

      <NFormField
        name="floor"
        label="Floor"
        description="Required integer floor value"
        :una="{
          formLabel: FORM_LABEL_STYLE,
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
      label="Generated room slug"
      description="Automatically created from building, floor, and room number."
      :una="{
        formLabel: FORM_LABEL_STYLE,
        formDescription: 'text-muted'
      }"
    >
      <NInput
        :model-value="generatedRoomId"
        placeholder="e.g. alfa-3-G23"
        disabled
      />
    </NFormField>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <NFormField
        name="description"
        label="Description"
        :una="{ formLabel: FORM_LABEL_STYLE }"
      >
        <NInput
          type="textarea"
          :rows="3"
          placeholder="Optional room notes"
        />
      </NFormField>

      <NFormField
        name="isActive"
        label="Status"
        description="Inactive rooms are hidden from active use."
        :una="{
          formLabel: FORM_LABEL_STYLE,
          formDescription: 'text-muted'
        }"
      >
        <NCheckbox label="Active room" />
      </NFormField>
    </div>

    <NButton
      type="submit"
      btn="soft-primary hover:outline-primary"
      leading="i-lucide-building-2"
    >
      Create room
    </NButton>
  </form>
</template>
