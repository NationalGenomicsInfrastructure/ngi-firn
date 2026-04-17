<script setup lang="ts">
import type { DisplayUserToUsers } from '~~/types/auth'
import { useQuery } from '@pinia/colada'
import { allUsersQuery } from '~/utils/queries/users'

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

function displayName(user: DisplayUserToUsers): string {
  if (user.googleName?.trim()) return user.googleName
  const given = user.googleGivenName?.trim() ?? ''
  const family = user.googleFamilyName?.trim() ?? ''
  const combined = [given, family].filter(Boolean).join(' ')
  return combined || user.googleEmail
}
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
    >
      <template #trigger>
        <template v-if="selectedUser">
          <div
            :key="selectedUser.firnId"
            class="flex items-center gap-2"
          >
            <NAvatarGroup :max="2">
              <NAvatar
                :key="`avatar-google-${selectedUser.firnId}`"
                :src="selectedUser.googleAvatar"
                :alt="displayName(selectedUser)"
                square="7"
                avatar="solid-primary"
              >
                <template #fallback>
                  <span class="inline-flex items-center gap-0 leading-none text-primary-200 dark:text-primary-100 font-extrabold"><NIcon
                    name="i-lucide-snowflake"
                    class="w-4 h-4"
                  />F</span>
                </template>
              </NAvatar>
              <NAvatar
                v-if="selectedUser.githubAvatar"
                :key="`avatar-github-${selectedUser.firnId}`"
                :src="selectedUser.githubAvatar"
                :alt="displayName(selectedUser)"
                square="7"
                avatar="solid-primary"
              />
            </NAvatarGroup>
            {{ displayName(selectedUser) }}
          </div>
        </template>
        <template v-else>
          Select user...
        </template>
      </template>

      <template #label="{ item }">
        <div class="flex items-center gap-2">
          <NAvatarGroup :max="2">
            <NAvatar
              :src="item.googleAvatar"
              :alt="displayName(item)"
              square="7"
              avatar="solid-primary"
            >
              <template #fallback>
                <span class="inline-flex items-center gap-0 leading-none text-primary-200 dark:text-primary-100 font-extrabold">
                  <NIcon
                    name="i-lucide-snowflake"
                    class="w-4 h-4"
                  />F
                </span>
              </template>
            </NAvatar>
            <NAvatar
              v-if="item.githubAvatar"
              :src="item.githubAvatar"
              :alt="displayName(item)"
              square="7"
              avatar="solid-primary"
            />
          </NAvatarGroup>
          {{ displayName(item) }}
        </div>
      </template>
    </NCombobox>
  </div>
</template>
