<script setup lang="ts">
const route = useRoute()
const { $trpc } = useNuxtApp()

const loading = ref(false)
const pendingUser = ref<any>(null)

// Get state from URL query parameters
const state = computed(() => route.query.state as string)
const linkingUserId = computed(() => route.query.userId as string)
const signupEmail = computed(() => route.query.email as string)

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

// Set active tab based on state
const activeTab = computed(() => {
  if (state.value === 'link-github' || state.value === 'signup-google') {
    return 'register'
  }
  return 'login'
})

// Handle OAuth login for existing users
async function handleLogin(provider: 'google' | 'github') {
  loading.value = true
  
  try {
    // Redirect to OAuth provider
    if (provider === 'github') {
      window.location.href = '/api/auth/github'
    } else if (provider === 'google') {
      window.location.href = '/api/auth/google'
    }
  } catch (error: any) {
    console.error('Login error:', error)
    loading.value = false
  }
}

// Handle Google registration
async function handleGoogleRegister() {
  loading.value = true
  
  try {
    // Redirect to Google OAuth for registration
    window.location.href = '/api/auth/google'
  } catch (error: any) {
    console.error('Registration error:', error)
    loading.value = false
  }
}

// Handle GitHub linking
async function handleGitHubLink() {
  if (!pendingUser.value) {
    console.error('No pending user: Please connect your Google account first.')
    return
  }

  loading.value = true
  
  try {
    // Redirect to GitHub OAuth with userId parameter for linking
    window.location.href = `/api/auth/github?userId=${pendingUser.value.id}`
  } catch (error: any) {
    console.error('GitHub linking error:', error)
    loading.value = false
  }
}

// Handle access request
async function handleRequestAccess() {
  if (!pendingUser.value) {
    console.error('No pending user: Please complete the registration process first.')
    return
  }

  loading.value = true
  
  try {
    // The user is already created and stored in the database
    // We just need to show a success message
    console.log('Access request submitted: Your request has been submitted and is awaiting admin approval.')
    
    // Clear pending user and redirect to pending approval page
    pendingUser.value = null
    await navigateTo('/pending-approval')
  } catch (error: any) {
    console.error('Access request error:', error)
    console.error('Request failed:', error.message || 'An error occurred while submitting your request.')
  } finally {
    loading.value = false
  }
}



// Watch for state changes and update UI accordingly
watchEffect(() => {
  if (state.value === 'link-github' && linkingUserId.value) {
    // If we have a linking user ID, we can restore the pending user state
    // This would typically fetch the user data from the server
    pendingUser.value = {
      id: linkingUserId.value,
      email: signupEmail.value
    }
  }
})
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
          <h3 class="text-lg font-semibold">
            Sign in to Firn
          </h3>
          <p class="text-muted">
            Use your existing account to access the system.
          </p>
        </div>
        
        <div class="flex flex-col gap-3">
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Sign in with GitHub"
            class="w-full"
            size="md"
            :loading="loading"
            @click="handleLogin('github')"
          />
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Sign in with Google"
            class="w-full"
            size="md"
            :loading="loading"
            @click="handleLogin('google')"
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
          v-if="!pendingUser"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">
              Register with Google
            </h3>
            <p class="text-muted">
              Start by connecting your Google account. This will be your primary account.
            </p>
          </div>
          
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-google"
            label="Connect with Google"
            size="md"
            class="w-full"
            :loading="loading"
            @click="handleGoogleRegister"
          />
        </div>

        <!-- Step 2: GitHub Linking -->
        <div
          v-else-if="pendingUser && !pendingUser.githubLinked"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">
              Link GitHub Account
            </h3>
            <p class="text-muted">
              Your Google account has been connected. Now link your GitHub account to complete the registration.
            </p>
            <p class="text-sm text-muted">
              Email: {{ pendingUser.email }}
            </p>
          </div>
          
          <NButton
            btn="solid-gray"
            leading="i-simple-icons-github"
            label="Link GitHub Account"
            size="md"
            class="w-full"
            :loading="loading"
            @click="handleGitHubLink"
          />
        </div>

        <!-- Step 3: Request Access -->
        <div
          v-else-if="pendingUser && pendingUser.githubLinked"
          class="space-y-4"
        >
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">
              Request Access
            </h3>
            <p class="text-muted">
              Your accounts are connected. You can now request access to the system.
            </p>
          </div>
          
          <NButton
            btn="solid-primary"
            label="Request Access"
            size="md"
            class="w-full"
            :loading="loading"
            @click="handleRequestAccess"
          />
        </div>
      </div>
    </template>
  </NTabs>
</template>
