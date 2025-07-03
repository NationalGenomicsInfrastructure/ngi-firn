<script setup lang="ts">
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()

// Stages of the registration process to render the correct UI
const stage = ref<'register-google' | 'link-github' | 'pending-approval'>('register-google')
const loadingGoogle = ref(false)
const loadingGitHub = ref(false)

const items = ref([
  {
    value: 'login',
    name: 'Sign in to Firn',
    _tabsTrigger: {
      leading: 'i-lucide-snowflake'
    }
  },
  {
    value: 'register',
    name: 'Register new account',
    _tabsTrigger: {
      leading: 'i-lucide-user-plus'
    }
  }
])

const activeTab = ref(items.value[0]?.value)

// Watch for state changes and update UI accordingly
watchEffect(() => {
  if (user.value && user.value.provider === 'google' && user.value.linkedGitHub === false) {
    loadingGoogle.value = false
    activeTab.value = 'register'
    stage.value = 'link-github'
  }
  if (user.value && user.value.provider === 'github' && user.value.linkedGitHub === true) {
    loadingGitHub.value = false
    activeTab.value = 'register'
    stage.value = 'pending-approval'
  }
})


</script>

<template>
  <div>
    <pre>
    {{ stage }}
    {{ user }}
    {{ session }}
  </pre>
  <NButton
            btn="solid-gray"
            leading="i-lucide-trash"
            label="Clear session"
            class="w-full"
            size="md"
            @click="clear()"
          />
  </div>
  <NTabs
    :items="items"
    :default-value="activeTab"
    :_tabs-list="{
      class: 'grid grid-cols-2 w-full border-b border-primary'
    }"
    :_tabs-content="{
      class: 'py-4 mx-auto w-full'
    }"
  >
    <template #content="{ item }">
      <!-- Login Tab -->
      <div
        v-if="item.value === 'login'"
        class="space-y-4"
      >
        <div class="text-center space-y-2 mb-6">
          <p class="text-muted">
            Use your existing account to access the system.
          </p>
        </div>
        
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Sign in with Google"
            class="w-full"
            size="md"
            to="/api/auth/google"
          />
          <div class="flex flex-col gap-3">
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Sign in with GitHub"
            class="w-full"
            size="md"
            to="/api/auth/github"
          />
        </div>
      </div>

      <!-- Register Tab -->
      <div
        v-if="item.value === 'register'"
        class="space-y-6"
      >
        <!-- Step 1: Google Registration -->
        <div
          v-if="stage === 'register-google'"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <p class="text-muted">
              Start by connecting your SciLifeLab Google account, which will become your primary access method:
            </p>
          </div>
          
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Create account with Google"
            size="md"
            class="w-full"
            :loading="loadingGoogle"
            @click="clear(); loadingGoogle = true; openInPopup('/api/auth/google')"
          />
        </div>

        <!-- Step 2: GitHub Linking -->
        <div
          v-else-if="stage === 'link-github'"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">
              Welcome to Firn, {{user?.name}}
            </h3>
            <p class="text-muted">
              Your Google account has been connected. Optionally, you can now also link your GitHub account as alternative access method or complete the registration.
            </p>
          </div>
          
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Link GitHub Account"
            size="md"
            class="w-full"
            :loading="loadingGitHub"
            @click="loadingGitHub = true; openInPopup('/api/auth/github')"
          />

          <NButton
            btn="solid-gray"
            leading="i-lucide-user-round-pen"
            label="Complete Registration"
            size="md"
            class="w-full"
            @click="stage = 'pending-approval'"
          />
        </div>

        <!-- Step 3: Request Access -->
        <div
          v-else-if="stage === 'pending-approval'"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">
              Your account is pending approval
            </h3>
            <p class="text-muted">
              Please wait for the administrator to approve your account.
            </p>
          </div>
          
          <NButton
            btn="solid-primary"
            label="Return to NGI Sweden"
            size="md"
            class="w-full"
            @click="activeTab = 'login'; clear()"
            to="https://ngisweden.scilifelab.se"
          />
        </div>
      </div>
    </template>
  </NTabs>
</template>
