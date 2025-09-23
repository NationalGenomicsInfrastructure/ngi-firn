<script setup lang="ts">
    import QrcodeVue from 'qrcode.vue'
    import type { Level, RenderAs, GradientType, ImageSettings } from 'qrcode.vue'
  
    interface Props {
      value?: string
      level?: Level
      renderAs?: RenderAs
      background?: string
      foreground?: string
      margin?: number
      imageSettings?: ImageSettings
      gradient?: boolean
      gradientType?: GradientType
      gradientStartColor?: string
      gradientEndColor?: string
    }

    const props = withDefaults(defineProps<Props>(), {
      value: 'qrcode',
      level: 'M',
      renderAs: 'svg',
      background: '#000000',
      foreground: '#a7c947',
      margin: 0,
      imageSettings: () => ({
        src: 'NGIFirn.jpg',
        width: 200,
        height: 200,
        excavate: true,
      }),
      gradient: false,
      gradientType: 'linear',
      gradientStartColor: '#2E86EF',
      gradientEndColor: '#a7c947',
    })

</script>
<template>
  <qrcode-vue
    :value="props.value"
    :level="props.level"
    :render-as="props.renderAs"
    :background="props.background"
    :foreground="props.foreground"
    :margin="props.margin"
    :gradient="props.gradient"
    :gradient-type="props.gradientType"
    :gradient-start-color="props.gradientStartColor"
    :gradient-end-color="props.gradientEndColor"
    :image-settings="props.imageSettings"
  />
</template>