<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { validateFirnUserTokenSchema } from '~~/schemas/tokens'
import { validateFirnUserToken } from '~/utils/mutations/tokens'

const props = defineProps<{
  audienceItems: string[]
}>()



/*
 * Token test: Submit to validation
 */

const formSchemaTest = toTypedSchema(validateFirnUserTokenSchema)

const { handleSubmit: handleSubmitTest, setFieldValue } = useForm({
  validationSchema: formSchemaTest,
  initialValues: {
    tokenString: '',
    expectedAudience: ''
  }
})

const { value: expectedAudienceValue, setValue: setExpectedAudienceValue } = useField<string>('expectedAudience')

const onExpectedAudienceUpdate = (value: string | undefined) => {
  if (!value) return
  setFieldValue('expectedAudience', value)
}

const onTokenTest = handleSubmitTest(async (valuesTest) => {
    try {
        const { validateToken } = validateFirnUserToken()
        validateToken(valuesTest)
    }
    catch (error) {
      console.error(error)
    }
})
</script>

<template>
<div class="flex flex-col gap-4 p-4">
        <NCard title="Test your token" description="Paste or type your token here and validate it">
            <form
            class="flex flex-col gap-4"
            @submit.prevent="onTokenTest()"
            >
            <NFormField
                name="tokenString"
                description="Enter your token here:"
            >
            <NInput
                type="textarea"
                rows="6"
                class="w-full"
                leading="i-lucide-key-round"
                placeholder="Enter your token here"
                :una="{
                inputWrapper: 'w-full'
                }"
            />
            </NFormField>
            <NFormField
                name="expectedAudience"
                description="Validate a proper audience restriction for your token"
            >
                <div class="flex flex-row gap-2">
                <NSelect
                    :model-value="expectedAudienceValue"
                    placeholder="No restriction"
                    :items="props.audienceItems"
                    @update:model-value="onExpectedAudienceUpdate"
                />
                <NButton
                    v-if="expectedAudienceValue"
                    btn="soft-error hover:outline-error"
                    label="i-lucide-x-circle"
                    icon
                    @click="setExpectedAudienceValue('')"
                />
                </div>
            </NFormField>
            <NButton
                label="Validate token"
                btn="soft-primary hover:outline-primary"
                class="w-full"
                type="submit"
                size="md"
            />
            </form>
        </NCard>
    </div>
</template>