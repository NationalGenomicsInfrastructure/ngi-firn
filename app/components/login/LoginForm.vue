<script setup lang="ts">
const { user, session, clear } = useUserSession()
const { toast } = useToast()
const route = useRoute()

// Stages of the registration process to render the correct UI
const stage = ref<'register-google' | 'link-github' | 'pending-approval'>('register-google')

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

const toastActions = [
  {
    label: 'Confirm',
    btn: 'solid-primary',
    altText: 'Confirm',
    onClick: () => {},
  },
]

// Watch for step/state changes and update UI accordingly
watch(() => route.query.step, (newLoginStep, oldLoginStep) => {
  if (newLoginStep && newLoginStep !== oldLoginStep) {
    if (newLoginStep === 'clear') {
      clear()
    }
    if (newLoginStep === 'link-github') {
      activeTab.value = 'register'
      stage.value = 'link-github'
    }
    if (newLoginStep === 'pending-approval') {
      activeTab.value = 'register'
      stage.value = 'pending-approval'
    }
  }
}, { immediate: true })

// Separate watcher for authStatus to ensure it triggers properly
watch(() => session.value?.authStatus, (newAuthStatus, oldAuthStatus) => {
  if (newAuthStatus && newAuthStatus !== oldAuthStatus) {
    console.log('AuthStatus changed:', newAuthStatus)
    toast({
      title: newAuthStatus.title,
      description: newAuthStatus.message,
      //toast: `border-${newAuthStatus.kind}`,
      toast: 'border-error',
      closable: true,
      actions: toastActions,
    })
  }
}, { immediate: true })


</script>

<template>
  <div>
    <pre>
    Stage: {{ stage }}
    Session: {{ session }}
  </pre>
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
            external
          />
          <div class="flex flex-col gap-3">
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Sign in with GitHub"
            class="w-full"
            size="md"
            to="/api/auth/github"
            external
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
            to="/api/auth/google"
            external
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
            to="/api/auth/github"
            external
          />

          <NButton
            btn="solid-gray"
            leading="i-lucide-skip-forward"
            label="Skip GitHub setup"
            size="md"
            class="w-full"
            to="/?step=pending-approval"
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
              Please wait for an administrator to approve your account.
            </p>
          </div>
          
          <NButton
            btn="solid-primary"
            label="Return to NGI Sweden"
            size="md"
            class="w-full"
            external
            to="https://ngisweden.scilifelab.se"
          />
        </div>
      </div>
    </template>
  </NTabs>
</template>
