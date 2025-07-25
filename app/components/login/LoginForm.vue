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

// Clear the session by default to prevent lingering sessions, unless a step in the multi-step process is specified.
onMounted(() => {
  if (!route.query.step) {
    clear()
  }
})

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
  
    // Function to get hardcoded toast classes for each auth status kind
    // The AuthStatus kind was chosen to allow using UnoCSS utility classes for success, warning, error or base
    // , but the mapping fails because of the immediate:true setting of the watcher:
    // [unocss] unmatched utility "dark:n-$-100" in shortcut "alert-border-$"
    // Therefore we hardcode the toast classes here:
      const getToastClass = (kind: string) => {
      switch (kind) {
        case 'success':
          return {
            leading: 'i-lucide-circle-check',
            class: 'alert-border-teal',
            progress: 'teal'
          }
        case 'warning':
          return {
            leading: 'i-lucide-triangle-alert',
            class: 'alert-border-orange',
            progress: 'amber'
          }
        case 'error':
          return {
            leading: 'i-lucide-circle-x',
            class: 'alert-border-red',
            progress: 'red'
          }
        case 'base':
        default:
          return {
            leading: 'i-lucide-info',
            class: 'alert-border-indigo',
            progress: 'indigo'
          }
      }
    }
    
    const toastClass = getToastClass(newAuthStatus.kind)
    toast({
      title: newAuthStatus.title,
      description: newAuthStatus.message,
      closable: true,
      duration: 6000,
      showProgress: true,
      ...toastClass
    })
  }
}, { immediate: true })


</script>

<template>
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
            <NAvatar
              v-if="user?.avatar"
              size="sm:3xl md:4xl lg:5xl"
              :src="user?.avatar"
              class="border-2 border-black rounded-full"
            />
            <NAvatar 
              v-else
              icon
              label="i-lucide-user-plus"
              size="sm:3xl md:4xl lg:5xl"
              class="border-2 border-black rounded-full"
            />
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
            <NAvatar
              v-if="user?.avatar"
              size="sm:3xl md:4xl lg:5xl"
              :src="user?.avatar"
              class="border-2 border-black rounded-full"
            />
            <NAvatar 
              v-else
              icon
              label="i-lucide-user-lock"
              size="sm:3xl md:4xl lg:5xl"
              class="border-2 border-black rounded-full"
            />
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
