<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { selfUserQuery } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Subscribe reactively to queries
const { state: selfUserState, asyncStatus: selfStatus } = useQuery(selfUserQuery)

// Derive loading state from query statuses
const isLoading = computed(() => selfStatus.value === 'loading')
const selfUser = computed(() => selfUserState.value.status === 'success' ? selfUserState.value.data : undefined)

const { user:sessionUser } = useUserSession()

const user = computed(() => {
  return {
    name: sessionUser.value?.name || '',
    provider: sessionUser.value?.provider || '',
    avatar: sessionUser.value?.avatar || '',
    linkedGitHub: sessionUser.value?.linkedGitHub || false,
    isAdminClientside: sessionUser.value?.isAdminClientside || false,
    firnId: selfUser?.value?.firnId || null,
    googleId: selfUser?.value?.googleId || undefined,
    googleName: selfUser?.value?.googleName || undefined,
    googleEmail: selfUser?.value?.googleEmail || '',
    githubId: selfUser?.value?.githubId || null,
    githubUrl: selfUser?.value?.githubUrl || null
  }
})
</script>

<template>
  <main class="mx-auto max-w-lg px-4 py-8 lg:px-8 sm:px-6">
    <div
    class="grid w-full place-items-center"
  >
    <NCard
      class="max-w-580px overflow-hidden"
      :_card-header="{
        class: 'p-0',
      }"
      :_card-content="{
        class: 'mt-4',
      }"
    >
      <template #header>
        <div class="relative">
          <NBadge
              :una="{
                badgeDefaultVariant: user.isAdminClientside ? 'badge-soft' : 'badge-soft-gray' }"
              class="absolute top-4 right-4 capitalize"
              :label="user.isAdminClientside ? 'Administrator' : 'User'"
            />
          <img
            src="https://images.unsplash.com/photo-1457269449834-928af64c684d?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Card image"
            class="h-56 w-full object-cover"
          >
          <div class="absolute inset-0 from-black/60 to-transparent bg-gradient-to-t" />
          <div class="absolute bottom-0 left-0 p-4">
            <div class="flex items-center gap-2">
              <NAvatar
                :src="user.avatar"
                :alt="user.name"
                size="sm:3xl md:4xl lg:5xl"
                class="ring-2 ring-white"
              />
              <div class="text-white">
                <p class="font-semibold text-2xl leading-none">
                  {{ user.name }}
                </p>
                <p class="text-lg text-white/80">
                  <NIcon name="i-lucide-snowflake" class="text-white text-mono text-bold" />{{ user.firnId }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- content -->
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-4 text-sm text-muted">
          <div class="flex items-center gap-1">
            <NIcon name="i-simple-icons-google" class="text-primary" />
            <span>{{ user.googleEmail || 'No Google account' }}</span>
          </div>
          <div class="flex items-center gap-1">
            <NIcon name="i-simple-icons-github" class="text-primary" />
            <span>{{ user.githubId ? `${user.githubId}` : 'No GitHub account linked' }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="w-full flex flex-col">
          <div class="mt-2 w-full flex items-center justify-between gap-4">
            <DialogUnlinkGithub
              v-if="!isLoading && user.githubId"
                :githubId="selfUser?.githubId"
                :githubAvatar="selfUser?.githubAvatar"
                :provider="user.provider"
              />
              <NButton
                v-if="!user.githubId"
                class="w-full"
                btn="soft-primary hover:outline-primary"
                leading="i-simple-icons-github"
                label="Link GitHub Account"
                to="/api/auth/github?redirectUrl=/profile"
                external
              />
          </div>
        </div>
      </template>
    </NCard>
  </div>
  </main>
</template>
