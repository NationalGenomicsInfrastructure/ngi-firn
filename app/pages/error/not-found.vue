<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const route = useRoute()
const router = useRouter()

// Error codes from query (e.g. ?message=invalid-project-id)
const ERROR_TITLES: Record<string, string> = {
  'invalid-project-id': 'Invalid project ID'
}

const title = computed(() => {
  const code = route.query.message as string
  return (code && ERROR_TITLES[code]) || 'Page not found.'
})

// Messages have a title and body for longer text
interface MessageEntry { title: string, body: string }

const ERROR_MESSAGES: Record<string, MessageEntry> = {
  'invalid-project-id': {
    title: 'This project does not exist.',
    body: 'The ID must be P followed by digits (e.g. P1, P00017).'
  }
}

const defaultMessage: MessageEntry = { title: '', body: '' }

const message = computed(() => {
  const code = route.query.message as string
  return (code && ERROR_MESSAGES[code]) || defaultMessage
})

const fromPath = computed(() => {
  const from = route.query.from as string
  if (!from) return null
  // If we came from an invalid project URL, go to projects list instead of the invalid URL
  if (from.startsWith('/projects/details/')) return '/projects'
  return from
})

function goBack() {
  if (fromPath.value) {
    router.push(fromPath.value)
  } else {
    router.back()
  }
}

const backLabel = computed(() =>
  route.query.from && (route.query.from as string).startsWith('/projects')
    ? 'Back to projects'
    : 'Go back'
)
</script>

<template>
    <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="title"
    />
      <div class="mx-auto max-w-xl rounded-md">
        <div class="border-2 border-primary-600 dark:border-primary-400 rounded-md p-4 text-center text-sm flex flex-col items-center space-y-4 bg-primary-50 dark:bg-primary-700">
          <NAvatar
            icon
            src="/ui/firn-error_carrot-updating-or-repairing_by-David-Revoy.webp"
            alt="'Carrot updating or repairing' by David Revoy, licensed under Creative Commons Attribution 4.0."
            size="sm:3xl md:4xl lg:6xl"
            class="border-2 border-primary-600 dark:border-primary-400 shadow-lg
              rounded-full dark:opacity-75"
          />
          <p class="text-muted">
            <NLink href="https://www.peppercarrot.com/en/viewer/misc__2016-04-13_carrot-updating-or-repairing_by-David-Revoy.html" target="_blank" external>
              <em>'Carrot updating or repairing'</em> by David Revoy,
            </NLink><br>
            <NLink href="https://creativecommons.org/licenses/by/4.0/" target="_blank" external>Creative Commons Attribution 4.0</NLink> licensed.
          </p>
          <template v-if="message.title || message.body">
            <h1 v-if="message.title" class="scroll-m-20 text-center font-display font-semibold text-primary-600 dark:text-primary-400 tracking-tight text-display text-2xl lg:text-3xl">
            {{ message.title }}
          </h1>
            <p v-if="message.body" class="text-lg text-center whitespace-pre-line">
              {{ message.body }}
            </p>
          </template>
        </div>
        <NButton
            btn="solid-primary"
            :label="backLabel"
            size="lg"
            class="w-full mt-4 transition delay-300 ease-in-out"
            @click="goBack"
          />
      </div>
  </main>
</template>
