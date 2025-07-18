<script setup lang="ts">
const colorMode = useColorMode()
function toggleDark() {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <NButton
    btn="ghost"
    label="i-radix-icons-moon dark:i-radix-icons-sun"
    icon
    @click="toggleDark()"
  />
</template>
