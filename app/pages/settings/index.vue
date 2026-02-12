<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const RADIUS = [0, 0.25, 0.375, 0.5, 0.625, 0.75, 1] as const

const colorMode = useColorMode()
const { primaryThemes, grayThemes } = useUnaThemes()
const { settings, reset } = useUnaSettings()

const currentPrimaryThemeHex = computed(() => settings.value.primaryColors?.['--una-primary-hex'])
const currentPrimaryThemeName = computed(() => {
  const theme = primaryThemes.find(([, theme]) => theme['--una-primary-hex'] === currentPrimaryThemeHex.value)
  return theme ? theme[0] : ''
})
const currentGrayThemeHex = computed(() => settings.value.grayColors?.['--una-gray-hex'])
const currentGrayThemeName = computed(() => {
  const theme = grayThemes.find(([, theme]) => theme['--una-gray-hex'] === currentGrayThemeHex.value)
  return theme ? theme[0] : ''
})

function updatePrimaryTheme(theme: string): void {
  settings.value.primary = theme
}

function updateGrayTheme(theme: string): void {
  settings.value.gray = theme
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function shuffleTheme(): void {
  if (primaryThemes.length > 0 && grayThemes.length > 0 && RADIUS.length > 0) {
    const randomPrimaryTheme = primaryThemes[Math.floor(Math.random() * primaryThemes.length)]?.[0] as string
    const randomGrayTheme = grayThemes[Math.floor(Math.random() * grayThemes.length)]?.[0] as string
    const randomRadius = RADIUS[Math.floor(Math.random() * RADIUS.length)] as number
    updatePrimaryTheme(randomPrimaryTheme)
    updateGrayTheme(randomGrayTheme)
    settings.value.radius = randomRadius
  }
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Settings"
      description="Theme your Firn experience."
    />

    <NAlert
      alert="border-gray"
      title="Your preferences are saved locally in a cookie."
      description="Mind that they are reset to Firn's defaults, if you switch devices or clear your browser's cookies."
      icon="i-lucide-cookie"
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
      <NCard
        title="Primary color"
        description="Set the main color to style the application."
        card="outline-gray"
      >
        <div class="grid grid-cols-7 gap-3">
          <button
            v-for="[key, theme] in primaryThemes"
            :key="key"
            :title="capitalize(key)"
            :style="{ background: theme['--una-primary-hex'] }"
            class="transition-all"
            rounded="full"
            square="6.5"
            :class="[currentPrimaryThemeName === key ? 'ring-2' : 'scale-93']"
            ring="primary offset-4 offset-base"
            :aria-label="`Primary color: ${key}`"
            @click="updatePrimaryTheme(key)"
          />
        </div>
      </NCard>

      <NCard
        title="Secondary color"
        description="Choose the muted, secondary color used in Firn."
        card="outline-gray"
      >
        <div class="grid grid-cols-7 gap-3">
          <button
            v-for="[key, theme] in grayThemes"
            :key="key"
            :title="capitalize(key)"
            :style="{ background: theme['--una-gray-hex'] }"
            :class="currentGrayThemeName === key ? 'ring-2' : 'scale-93'"
            class="transition-all"
            rounded="full"
            square="6.5"
            ring="gray offset-4 offset-base"
            :aria-label="`Gray color: ${key}`"
            @click="updateGrayTheme(key)"
          />
        </div>
      </NCard>

      <NCard
        title="Radius"
        description="Adjust the roundness of the application's buttons and other elements."
        card="outline-gray"
      >
        <div class="grid grid-cols-3 gap-2 py-1.5">
          <NButton
            v-for="r in RADIUS"
            :key="r"
            btn="solid-gray"
            size="xs"
            :class="r === settings.radius ? 'ring-2 ring-primary' : ''"
            @click="settings.radius = r"
          >
            {{ r }}
          </NButton>
        </div>
      </NCard>

      <NCard
        title="Mode"
        description="Choose the color mode of the application."
        card="outline-gray"
      >
        <div class="flex justify-around py-1.5 space-x-2">
          <NButton
            btn="solid-gray"
            :class="{ 'ring-2 ring-primary': colorMode.preference === 'system' }"
            leading="i-radix-icons-desktop"
            class="px-3"
            size="xs"
            label="System"
            @click="colorMode.preference = 'system'"
          />
          <NButton
            btn="solid-gray"
            :class="{ 'ring-2 ring-primary': colorMode.preference === 'light' }"
            leading="i-radix-icons-sun"
            class="px-3"
            size="xs"
            label="Light"
            @click="colorMode.preference = 'light'"
          />
          <NButton
            btn="solid-gray"
            :class="{ 'ring-2 ring-primary': colorMode.preference === 'dark' }"
            leading="i-radix-icons-moon"
            class="px-3"
            size="xs"
            label="Dark"
            @click="colorMode.preference = 'dark'"
          />
        </div>
      </NCard>
    </div>

    <NSeparator class="mt-6" />

    <div class="w-full grid grid-cols-2 gap-2 mt-6">
      <NButton
        size="xs"
        btn="solid-gray"
        label="Reset"
        leading="i-radix-icons-reload"
        @click="reset"
      />
      <NButton
        size="xs"
        btn="solid"
        class="transition"
        label="Shuffle"
        leading="i-lucide-paintbrush"
        @click="shuffleTheme"
      />
    </div>
  </main>
</template>
