<script setup lang="ts">
import JsBarcode from 'jsbarcode'
import type { BarcodeOptions } from '../../../types/barcode'

interface Props {
  value?: string // The value of the bar code
  options?: BarcodeOptions // The options for the barcode generator
  // @see https://github.com/lindell/JsBarcode#options
  tag?: 'canvas' | 'svg' // The tag name of the component's root element
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  options: () => ({}),
  tag: 'canvas'
})

const elementRef = ref<HTMLElement>()

// Utility function to resolve CSS variables to their computed values
const resolveCSSVariable = (value: string, element: HTMLElement): string => {
  if (value.startsWith('var(')) {
    // Extract the CSS variable name from var(--variable-name)
    const match = value.match(/var\(([^)]+)\)/)
    if (match && match[1]) {
      const cssVar = match[1].trim()
      const computedStyle = getComputedStyle(element)
      return computedStyle.getPropertyValue(cssVar).trim()
    }
  }
  return value
}

// Process options to resolve any CSS variables to their computed values
const processOptions = (options: BarcodeOptions, element: HTMLElement): BarcodeOptions => {
  const processedOptions = { ...options }

  // Process color properties that might contain CSS variables
  const colorProperties = ['background', 'lineColor']

  colorProperties.forEach((prop) => {
    if (processedOptions[prop as keyof BarcodeOptions]) {
      const value = processedOptions[prop as keyof BarcodeOptions] as string
      const resolved = resolveCSSVariable(value, element);
      (processedOptions[prop as keyof BarcodeOptions] as string) = resolved
    }
  })

  return processedOptions
}

// Generate barcode using JsBarcode library
const generate = async () => {
  // If the element reference is not set or the value is not set, return
  if (!elementRef.value || !props.value) return
  // Wait for the next tick to ensure the element is mounted
  await nextTick()
  // Try to generate the barcode using JsBarcode library
  try {
    const processedOptions = processOptions(props.options, elementRef.value)
    JsBarcode(elementRef.value, String(props.value), processedOptions)
  }
  catch (error) {
    console.error('Error generating barcode:', error)
  }
}

// Watch for changes in props and regenerate barcode if they change
watch(
  () => [props.value, props.options],
  () => {
    generate()
  },
  { deep: true, immediate: false }
)

// Generate barcode when the component is mounted
onMounted(() => {
  generate()
})
</script>

<template>
  <component
    :is="tag"
    ref="elementRef"
    v-bind="$attrs"
  />
</template>
