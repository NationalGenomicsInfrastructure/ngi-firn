<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { QuaggaJSCodeReader, InputStreamType } from "@ericblade/quagga2";

const props = defineProps<{
    type: InputStreamType
    readerTypes: QuaggaJSCodeReader[]
}>()

const barcodeData = ref('')
const { copy, copied } = useClipboard({ source: barcodeData })
</script>

<template>
  <NDialog
    title="Scan Barcode"
    description="Use the camera to scan a barcode"
    :_dialog-footer="{
      class: 'sm:justify-start',
    }"
  >
    <template #trigger>
      <NButton btn="solid-gray">
        Scan Barcode
      </NButton>
    </template>
    <NAspectRatio
        :ratio="16 / 9"
      >
        <BarcodeReader
        :on-detected="(data) => barcodeData = data"
        :reader-types="props.readerTypes"
        :type="props.type"
        />
    </NAspectRatio>

    <form
      class="flex gap-2"
      @submit.prevent="copy(barcodeData)"
    >
      <NInput
        v-model="barcodeData"
        type="textarea"
        leading="i-radix-icons-link-2"
        :una="{
          inputWrapper: 'w-full',
        }"
        read-only
      />

      <NButton
        icon
        square
        type="submit"
        :btn="copied ? 'outline' : 'solid'"
        :label="!copied ? 'i-radix-icons-copy' : 'i-radix-icons-check'"
      />
    </form>

    <template #footer>
      <NDialogClose>
        <NButton
          btn="soft-gray"
        >
          Close
        </NButton>
      </NDialogClose>
    </template>
  </NDialog>
</template>

