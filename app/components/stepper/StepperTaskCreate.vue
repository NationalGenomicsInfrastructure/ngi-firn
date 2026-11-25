<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { createTaskSchema } from '~~/schemas/tasks/tasks'
import type { TaskImportance, TaskVisibility } from '~~/schemas/tasks/enums'
import type { DisplayUserToUsers } from '~~/types/auth'
import { createTask } from '~/utils/mutations/tasks/tasks'
import { focusFirstFormFieldError } from '~/utils/inventory/room'
import { displayUserName } from '~/utils/users/display'
import { TASK_IMPORTANCE_OPTIONS, TASK_VISIBILITY_OPTIONS, taskOptionLabel } from '~/utils/tasks/options'

const emit = defineEmits<{
  created: [taskSlug: string]
}>()

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'
const STEP1_FIELDS = ['title', 'description', 'visibility', 'importance', 'dueDate'] as const

const items = [
  { title: 'Basics', description: 'Describe the task', icon: 'i-lucide-info', stage: 1 },
  { title: 'Steps', description: 'Plan the work', icon: 'i-lucide-list-checks', stage: 2 },
  { title: 'Links', description: 'Projects and inventory', icon: 'i-lucide-link', stage: 3 },
  { title: 'People', description: 'Assign responsibility', icon: 'i-lucide-users', stage: 4 },
  { title: 'Review', description: 'Confirm and create', icon: 'i-lucide-clipboard-check', stage: 5 }
]

const stepper = useTemplateRef('taskStepper')
const { showError } = useFirnToast()
const { mutateAsync: createTaskAsync, isLoading: isCreating } = createTask()

const taskFormSchema = toTypedSchema(
  createTaskSchema.pick({
    title: true,
    description: true,
    visibility: true,
    importance: true,
    dueDate: true
  })
)

const { handleSubmit, validate, errors, resetForm, values } = useForm({
  validationSchema: taskFormSchema,
  initialValues: {
    title: '',
    description: '',
    visibility: 'private' as TaskVisibility,
    importance: 'ordinary' as TaskImportance,
    dueDate: undefined as string | undefined
  },
  keepValuesOnUnmount: true
})

const { value: visibilityValue, setValue: setVisibilityValue } = useField<TaskVisibility>('visibility')
const { value: importanceValue, setValue: setImportanceValue } = useField<TaskImportance>('importance')
const { value: dueDateValue, setValue: setDueDateValue } = useField<string | undefined>('dueDate')

// Users are kept as full objects for display; only the firnIds are sent to the server.
const responsibleUsers = ref<DisplayUserToUsers[]>([])
const viewerUsers = ref<DisplayUserToUsers[]>([])

function addUser(list: DisplayUserToUsers[], user: DisplayUserToUsers | undefined): DisplayUserToUsers[] {
  if (!user || list.some(entry => entry.firnId === user.firnId)) return list
  return [...list, user]
}

// A cleared date input yields '', which the calendar-date schema would reject.
function onDueDateUpdate(value: unknown) {
  setDueDateValue(typeof value === 'string' && value ? value : undefined)
}

const visibilityLabel = computed(() => taskOptionLabel(TASK_VISIBILITY_OPTIONS, visibilityValue.value))
const importanceLabel = computed(() => taskOptionLabel(TASK_IMPORTANCE_OPTIONS, importanceValue.value))

async function nextFromStep1() {
  await validate()
  const stageErrors: Record<string, unknown> = {}
  for (const field of STEP1_FIELDS) {
    if (errors.value[field]) stageErrors[field] = errors.value[field]
  }
  if (Object.keys(stageErrors).length > 0) {
    await focusFirstFormFieldError(stageErrors)
    return
  }
  stepper?.value?.nextStep()
}

const onSubmit = handleSubmit(async (formValues) => {
  try {
    const task = await createTaskAsync({
      ...formValues,
      description: formValues.description?.trim() || undefined,
      responsibleFirnIds: responsibleUsers.value.map(user => user.firnId),
      viewerFirnIds: viewerUsers.value.map(user => user.firnId)
    })
    if (!task) return

    resetForm()
    responsibleUsers.value = []
    viewerUsers.value = []
    // Jump directly; looping prevStep() freezes reka-ui's stepper (see StepperInventoryEquipmentAdd).
    stepper?.value?.goToStep(0)
    emit('created', task.slug)
  }
  catch (error) {
    // The mutation's onError already raised a toast; this only guards a network-level throw.
    showError(`Task "${formValues.title}" could not be created: ${error}`, 'Task creation error')
  }
})
</script>

<template>
  <NStepper
    ref="taskStepper"
    :items="items"
  >
    <template #content="{ item }">
      <div class="h-full flex flex-col p-2 sm:p-4 mx-auto">
        <!-- Step 1: metadata -->
        <form
          v-if="item.stage === 1"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="nextFromStep1()"
        >
          <NCard
            title="Task basics"
            description="Give the task a title and decide who may see it."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <NFormField
              name="title"
              label="Title"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <NInput placeholder="e.g. Aliquot the new antibody batch" />
            </NFormField>

            <NFormField
              name="description"
              label="Description"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <NInput
                type="textarea"
                :rows="3"
                placeholder="Optional notes"
              />
            </NFormField>

            <NFormField
              name="importance"
              label="Importance"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <FormFieldTaskImportance
                :model-value="importanceValue"
                @update:model-value="setImportanceValue"
              />
            </NFormField>

            <NFormField
              name="visibility"
              label="Visibility"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <FormFieldTaskVisibility
                :model-value="visibilityValue"
                @update:model-value="setVisibilityValue"
              />
            </NFormField>

            <NFormField
              name="dueDate"
              label="Due date"
              class="md:max-w-xs"
              :una="{ formLabel: FORM_LABEL_STYLE }"
            >
              <NInput
                type="date"
                :model-value="dueDateValue ?? ''"
                @update:model-value="onDueDateUpdate"
              />
            </NFormField>
          </NCard>

          <div class="flex justify-end">
            <NButton
              type="submit"
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <!-- Step 2: steps (placeholder) -->
        <form
          v-else-if="item.stage === 2"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="stepper?.nextStep()"
        >
          <NCard
            title="Task steps"
            description="Planned steps will be added here in a later version."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <p class="text-sm text-muted">
              You can add steps to the task after it has been created.
            </p>
          </NCard>

          <div class="flex justify-between">
            <NButton
              type="button"
              label="Previous"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-arrow-left"
              @click="stepper?.prevStep()"
            />
            <NButton
              type="submit"
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <!-- Step 3: projects and inventory (placeholder) -->
        <form
          v-else-if="item.stage === 3"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="stepper?.nextStep()"
        >
          <NCard
            title="Projects and inventory"
            description="Linking projects and inventory will be added here in a later version."
            card="outline-gray"
            :una="{ cardContent: 'space-y-4', cardDescription: 'text-muted' }"
          >
            <p class="text-sm text-muted">
              You can link projects and inventory after the task has been created.
            </p>
          </NCard>

          <div class="flex justify-between">
            <NButton
              type="button"
              label="Previous"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-arrow-left"
              @click="stepper?.prevStep()"
            />
            <NButton
              type="submit"
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <!-- Step 4: people -->
        <form
          v-else-if="item.stage === 4"
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="stepper?.nextStep()"
        >
          <NCard
            title="People"
            description="You become the managing owner. Optionally assign others to do or follow the work."
            card="outline-gray"
            :una="{ cardContent: 'space-y-6', cardDescription: 'text-muted' }"
          >
            <div class="space-y-2">
              <p :class="FORM_LABEL_STYLE">
                Responsible users
              </p>
              <SelectFirnUsers @update:model-value="responsibleUsers = addUser(responsibleUsers, $event)" />
              <ListFirnUsers
                v-model="responsibleUsers"
                empty-text="Nobody assigned yet. Colleagues can claim the task later."
                noun="responsible users"
              />
            </div>

            <div class="space-y-2">
              <p :class="FORM_LABEL_STYLE">
                Viewers
              </p>
              <SelectFirnUsers @update:model-value="viewerUsers = addUser(viewerUsers, $event)" />
              <ListFirnUsers
                v-model="viewerUsers"
                empty-text="No additional viewers."
                noun="viewers"
              />
            </div>
          </NCard>

          <div class="flex justify-between">
            <NButton
              type="button"
              label="Previous"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-arrow-left"
              @click="stepper?.prevStep()"
            />
            <NButton
              type="submit"
              label="Next"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-arrow-right"
            />
          </div>
        </form>

        <!-- Step 5: review and confirmation -->
        <form
          v-else
          class="mx-auto p-4 space-y-4 w-full"
          @submit.prevent="onSubmit()"
        >
          <NCard
            title="Review"
            description="Confirm the most important values before creating the task."
            card="soft-gray"
            :una="{ cardDescription: 'text-muted' }"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Title
                </p>
                <p class="font-medium">
                  {{ values.title || '—' }}
                </p>
              </div>
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Importance
                </p>
                <p class="font-medium">
                  {{ importanceLabel }}
                </p>
              </div>
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Due date
                </p>
                <p class="font-medium">
                  {{ values.dueDate || '—' }}
                </p>
              </div>
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Visibility
                </p>
                <p class="font-medium">
                  {{ visibilityLabel }}
                </p>
              </div>
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Responsible
                </p>
                <p class="font-medium">
                  {{ responsibleUsers.length ? responsibleUsers.map(displayUserName).join(', ') : '—' }}
                </p>
              </div>
              <div>
                <p :class="[FORM_LABEL_STYLE, 'mb-0.5']">
                  Viewers
                </p>
                <p class="font-medium">
                  {{ viewerUsers.length ? viewerUsers.map(displayUserName).join(', ') : '—' }}
                </p>
              </div>
            </div>
          </NCard>

          <div class="flex justify-between">
            <NButton
              type="button"
              label="Previous"
              btn="soft-gray hover:outline-gray"
              leading="i-lucide-arrow-left"
              @click="stepper?.prevStep()"
            />
            <NButton
              type="submit"
              label="Create task"
              btn="soft-primary hover:outline-primary"
              trailing="i-lucide-clipboard-plus"
              :loading="isCreating"
            />
          </div>
        </form>
      </div>
    </template>
  </NStepper>
</template>
