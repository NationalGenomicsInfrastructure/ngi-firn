<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'
import { useQuery } from '@pinia/colada'
import { allUsersQuery } from '~/utils/queries/users'
import { displayUserName as displayName } from '~/utils/users/display'

const props = defineProps<{
  modelValue?: DisplayUserToUsers | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DisplayUserToUsers | undefined]
}>()

const { data: users } = useQuery(allUsersQuery)

const selectedUser = computed({
  get: () => props.modelValue ?? undefined,
  set: (value: DisplayUserToUsers | undefined) => emit('update:modelValue', value)
})

const items = computed(() => users.value ?? [])
</script>

<template>
  <div class="flex">
    <NCombobox
      v-model="selectedUser"
      :items="items"
      by="firnId"
      :_combobox-input="{
        placeholder: 'Select user...'
      }"
      text-empty="No user found."
    >
      <template #trigger>
        <template v-if="selectedUser">
          <div
            :key="selectedUser.firnId"
            class="flex items-center gap-2"
          >
            <AvatarFirn :user="selectedUser" />
            {{ displayName(selectedUser) }}
          </div>
        </template>
        <template v-else>
          Select user...
        </template>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <AvatarFirn :user="item" />
          {{ displayName(item) }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
