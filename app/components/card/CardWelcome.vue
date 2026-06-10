<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { selfUserQuery } from '~/utils/queries/users'

const { state: selfUserState, asyncStatus: selfStatus } = useQuery(selfUserQuery)
const isLoading = computed(() => selfStatus.value === 'loading')
const selfUser = computed(() =>
  selfUserState.value.status === 'success' ? selfUserState.value.data : undefined
)

const { user: sessionUser } = useUserSession()

const user = computed(() => ({
  name: sessionUser.value?.name ?? '',
  avatar: sessionUser.value?.avatar ?? '',
  isAdmin: sessionUser.value?.isAdminClientside ?? false,
  firnId: selfUser.value?.firnId ?? null,
  googleEmail: selfUser.value?.googleEmail ?? '',
  githubId: selfUser.value?.githubId ?? null,
  githubUrl: selfUser.value?.githubUrl ?? null
}))

const firstName = computed(() => user.value.name.split(' ')[0] || user.value.name)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return { text: 'Still up?', icon: 'i-lucide-moon' }
  if (h < 12) return { text: 'Good morning', icon: 'i-lucide-sunrise' }
  if (h < 17) return { text: 'Good afternoon', icon: 'i-lucide-sun' }
  if (h < 21) return { text: 'Good evening', icon: 'i-lucide-sunset' }
  return { text: 'Good night', icon: 'i-lucide-moon' }
})
</script>

<template>
  <NCard
    card="outline-gray"
    class="overflow-hidden"
    :_card-header="{ class: 'p-0' }"
    :_card-content="{ class: 'mt-5' }"
  >
    <template #header>
      <div class="relative h-36 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 overflow-hidden">
        <!-- Decorative background shapes -->
        <div class="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
        <div class="absolute top-6 -right-10 w-40 h-40 rounded-full bg-white/5" />
        <div class="absolute -bottom-8 left-8 w-24 h-24 rounded-full bg-white/5" />

        <!-- Large decorative snowflake -->
        <NIcon
          name="i-lucide-snowflake"
          class="absolute bottom-2 right-5 text-white/10 text-7xl pointer-events-none select-none"
        />

        <!-- Role badge -->
        <NBadge
          :una="{ badgeDefaultVariant: user.isAdmin ? 'badge-soft dark:badge-solid' : 'badge-soft-gray dark:badge-solid-gray' }"
          class="absolute top-4 right-4 capitalize"
          :label="user.isAdmin ? 'Administrator' : 'User'"
        />

        <!-- Avatar + name -->
        <div class="absolute bottom-0 left-0 p-4 flex items-end gap-3">
          <NAvatar
            :src="user.avatar"
            :alt="user.name"
            size="3xl"
            class="ring-2 ring-white/80 shrink-0"
          />
          <div class="text-white pb-0.5">
            <p class="text-sm font-medium text-white/70 flex items-center gap-1 leading-none mb-1">
              <NIcon
                :name="greeting.icon"
                class="text-sm"
              />
              {{ greeting.text }}!
            </p>
            <p class="font-bold text-xl leading-tight">
              {{ firstName || '—' }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Info fields -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
      <IndicatorIconCard
        icon="i-lucide-snowflake"
        label="Firn ID"
        value-class="text-muted"
      >
        <template v-if="isLoading">
          <span class="inline-block w-20 h-3.5 rounded bg-muted/40 animate-pulse" />
        </template>
        <span v-else>{{ user.firnId ?? '—' }}</span>
      </IndicatorIconCard>

      <IndicatorIconCard
        icon="i-lucide-log-in"
        label="Signed in via"
        :value="sessionUser?.provider || '—'"
        value-class="capitalize text-muted"
      />

      <IndicatorIconCard
        icon="i-simple-icons-google"
        label="Google account"
        value-class="text-muted"
        class="sm:col-span-2"
      >
        <template v-if="isLoading">
          <span class="inline-block w-44 h-3.5 rounded bg-muted/40 animate-pulse" />
        </template>
        <span v-else>{{ user.googleEmail || '—' }}</span>
      </IndicatorIconCard>
    </div>
  </NCard>
</template>
