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

// Generate barcode using JsBarcode library
const generate = async () => {
  // If the element reference is not set or the value is not set, return
  if (!elementRef.value || !props.value) return
  // Wait for the next tick to ensure the element is mounted
  await nextTick()
  // Try to generate the barcode using JsBarcode library
  try {
    JsBarcode(elementRef.value, String(props.value), props.options)
  } catch (error) {
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
