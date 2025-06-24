<script setup lang="ts">
// https://better-auth.vercel.app/docs/integrations/nuxt#ssr-usage
const { user, session, client } = useAuth()
const toast = useToast()
const { data: accounts } = await useAsyncData('accounts', () => client.listAccounts())

function hasProvider(provider: string) {
  return accounts.value?.data?.some(account => account.provider === provider)
}

function handleOAuthLogin(provider: string) {
  // The actual OAuth flow will be handled by the route
  loading.value = true
}

function handleRegister(provider: string) {
  if (!username.value) {
    // Show error or handle validation
    return
  }
  
  if (!requestAccess.value) {
    // First time: Link OAuth account
    handleOAuthLogin(provider)
  } else {
    // Second time: Request access
    loading.value = true
    // TODO: Implement access request logic
    setTimeout(() => {
      loading.value = false
    }, 1000)
  }
}

// UI state: Loading state for the login form

const loading = ref(false)
const username = ref('')
const requestAccess = ref(false)

// UI config: Tabs for the login form
const tabs = ref([
  {
    value: 'login',
    name: 'Sign in to Firn',
    _tabsTrigger: {
      leading: 'i-lucide-snowflake',
    },
  },
  {
    value: 'register',
    name: 'Register new account',
    _tabsTrigger: {
      leading: 'i-lucide-user-plus',
    },
  },
])
</script>

<template>
  <NTabs
    :items="tabs"
    default-value="login"
    :_tabs-list="{
      class: 'grid grid-cols-2 w-full border-b border-primary',
    }"
    :_tabs-content="{
      class: 'py-4 mx-auto w-full',
    }"
  >
    <template #content="{ item }">
      <!-- Login Tab -->
      <div v-if="item.value === 'login'" class="space-y-4">
        <div class="flex flex-col gap-3">
          <NButton
            to="/api/auth/github"
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Sign in with GitHub"
            class="w-full"
            size="md"
            external
            @click="handleOAuthLogin('github')"
          />
          <NButton
            to="/api/auth/google"
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Sign in with Google"
            class="w-full"
            size="md"
            external
            @click="handleOAuthLogin('google')"
          />
        </div>
      </div>

      <!-- Register Tab -->
      <div v-if="item.value === 'register'" class="space-y-6">
        <NFormGroup
          label="Choose a username"
          required
        >
          <NInput
            v-model="username"
            placeholder="brilliant.researcher"
            :disabled="requestAccess"
          />
        </NFormGroup>

        <div v-if="!requestAccess" class="space-y-3">
          <p class="text-base text-muted">
            Connect your account with the following providers:
          </p>

          <NButton
            v-if="hasProvider('github')"
            btn="solid-primary"
            leading="i-simple-icons-github"
            trailing="i-lucide-badge-check"
            label="Connected with GitHub"
            size="md"
            class="w-full"
          />
          <NButton
            v-else
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Connect with GitHub"
            size="md"
            class="w-full"
            :disabled="!username"
            @click="client.linkSocial({ provider: 'github' })"
          />

          <NButton
            v-if="hasProvider('google')"
            btn="solid-primary"
            leading="i-simple-icons-google"
            trailing="i-lucide-badge-check"
            label="Connected with Google"
            size="md"
            class="w-full"
          />
          <NButton
            v-else
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Connect with Google"
            size="md"
            class="w-full"
            external
            :disabled="!username"
            @click="client.linkSocial({ provider: 'google' })"
          />
        </div>

        <div v-else class="space-y-3">
          <p class="text-base text-muted">
            Your account is connected. You can now request access to the system:
          </p>
          <NButton
            btn="solid-primary"
            label="Request Access"
            size="md"
            class="w-full"
            :loading="loading"
            @click="handleRegister('request')"
          />
        </div>
      </div>
    </template>
  </NTabs>
</template>
