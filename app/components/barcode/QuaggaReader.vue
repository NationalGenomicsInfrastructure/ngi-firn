<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import Quagga from '@ericblade/quagga2'
import type { InputStreamType, QuaggaJSCodeReader, QuaggaJSConfigObject, QuaggaJSResultCallbackFunction, QuaggaJSResultObject } from '@ericblade/quagga2'

const props = withDefaults(
  defineProps<{
    onDetected?: (result: QuaggaJSResultObject) => void
    onProcessed?: (data: QuaggaJSResultObject) => void
    type?: InputStreamType
    readerTypes?: QuaggaJSCodeReader[]
    constraints?: MediaTrackConstraintSet
    locate?: boolean
    numOfWorkers?: number
    frequency?: number
    facingMode?: string
  }>(),
  {
    onDetected: (result: QuaggaJSResultObject) => {
      console.log('detected: ', result)
    },
    onProcessed: (result: QuaggaJSResultObject) => {
      const drawingCtx = Quagga.canvas.ctx.overlay
      const drawingCanvas = Quagga.canvas.dom.overlay

      if (result) {
        if (result.boxes) {
          drawingCtx.clearRect(
            0,
            0,
            parseInt(drawingCanvas?.getAttribute('width')!),
            parseInt(drawingCanvas?.getAttribute('height')!)
          )
          result.boxes
            .filter(box => box !== result.box)
            .forEach((box) => {
              Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
                color: 'green',
                lineWidth: 2
              })
            })
        }
        if (result.box) {
          Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
            color: '#00F',
            lineWidth: 2
          })
        }

        if (result.codeResult && result.codeResult.code) {
          Quagga.ImageDebug.drawPath(
            result.line,
            { x: 'x', y: 'y' },
            drawingCtx,
            { color: 'red', lineWidth: 3 }
          )
        }
      }
    },
    type: 'LiveStream',
    readerTypes: () => ['code_128_reader'],
    constraints: () => ({
      width: 640,
      height: 480,
      aspectRatio: {
        min: 0,
        max: 1
      }
    }),
    locate: true,
    numOfWorkers: 4,
    frequency: 10,
    facingMode: 'environment'
  }
)

const quaggaState = reactive<QuaggaJSConfigObject>({
  inputStream: {
    type: props.type,
    constraints: props.constraints
  },
  locator: {
    patchSize: 'medium',
    halfSample: true
  },
  numOfWorkers: props.numOfWorkers,
  frequency: props.frequency,
  decoder: {
    readers: props.readerTypes
  },
  locate: props.locate
})

watch(
  () => props.onDetected,
  (newValue, oldValue) => {
    if (oldValue) Quagga.offDetected(oldValue)
    if (newValue) Quagga.onDetected(newValue)
  }
)

watch(
  () => props.onProcessed,
  (newValue, oldValue) => {
    if (oldValue)
      Quagga.offProcessed(oldValue)
    if (newValue)
      Quagga.onProcessed(newValue)
  }
)

onMounted(() => {
  Quagga.init(quaggaState, (err: any) => {
    if (err) {
      return console.error(err)
    }
    Quagga.start()
  })
  Quagga.onDetected(props.onDetected)
  Quagga.onProcessed(props.onProcessed)
})

onBeforeUnmount(() => {
  if (props.onDetected) Quagga.offDetected(props.onDetected)
  if (props.onProcessed) Quagga.offProcessed(props.onProcessed)
  Quagga.stop()
})
</script>

<template>
  <div
    id="interactive"
    class="viewport scanner"
  >
    <video />
    <canvas class="drawingBuffer" />
  </div>
</template>

<style scoped>
.viewport canvas,
.viewport video {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
