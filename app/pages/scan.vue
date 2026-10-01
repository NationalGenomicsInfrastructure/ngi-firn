<script setup lang="ts">
/*
 * Barcode scanner page.
 * ********************
 *
 * Built for the lab bench: a phone or tablet paired with a keyboard-wedge scanner, or
 * the device camera. Large touch targets, one column, little else.
 *
 *   - Info     scan one code, see the essentials of that entity.
 *   - Actions  scan a basket of codes, review, approve once.
 *   - Plans    planned tasks (not built yet).
 *
 * The basket lives here rather than in its tab: tab panels unmount when hidden, and
 * a quick look at the Info tab must not throw away a half-scanned rack.
 */

const { loggedIn } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
}, { immediate: true })

const TRIGGER_CLASS = 'min-h-14 text-base sm:text-lg'

const tabs = ref([
  {
    value: 'info',
    name: 'Info',
    _tabsTrigger: { leading: 'i-lucide-info', class: TRIGGER_CLASS }
  },
  {
    value: 'actions',
    name: 'Actions',
    _tabsTrigger: { leading: 'i-lucide-shopping-basket', class: TRIGGER_CLASS }
  },
  {
    value: 'plans',
    name: 'Plans',
    _tabsTrigger: { leading: 'i-lucide-calendar-clock', class: TRIGGER_CLASS }
  }
])

const basket = useScanBasket()

/* The last code scanned on the Info tab; kept here so it survives a tab switch. */
const lastInfoCode = ref<string | null>(null)
</script>

<template>
  <div class="container mx-auto max-w-3xl px-4 md:px-6 h-full pb-4">
    <NToaster />
    <LogoFirn class="h-12 sm:h-16 w-auto mt-2 mb-0 mx-auto" />
    <h4 class="text-primary-700 dark:text-muted text-md capitalize text-center mb-4 sm:mb-8">
      Barcode-Scanner
    </h4>

    <NTabs
      :items="tabs"
      default-value="info"
      :_tabs-list="{
        class: 'grid grid-cols-3 w-full h-auto border-b border-primary bg-primary-50 dark:bg-primary/10'
      }"
      :_tabs-content="{
        class: 'py-4 sm:py-8 mx-auto w-full'
      }"
    >
      <template #content="{ item }">
        <div
          v-if="item.value === 'info'"
          class="space-y-5"
        >
          <BarcodeInventoryScanner
            large
            clear-on-scan
            placeholder="Scan one barcode"
            @scanned="lastInfoCode = $event"
            @cleared="$event && (lastInfoCode = null)"
          />
          <ScanEntityInfo
            v-if="lastInfoCode"
            :code="lastInfoCode"
          />
          <div
            v-else
            class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-muted"
          >
            <NIcon
              name="i-lucide-scan-barcode"
              class="text-4xl"
            />
            <p class="font-medium">
              Scan a barcode
            </p>
            <p class="text-sm">
              to see detailed information about the scanned item.
            </p>
          </div>
        </div>

        <ScanBasket
          v-else-if="item.value === 'actions'"
          :basket="basket"
        />

        <div
          v-else-if="item.value === 'plans'"
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-muted"
        >
          <NIcon
            name="i-lucide-calendar-clock"
            class="text-4xl"
          />
          <p class="font-medium">
            Coming soon
          </p>
          <p class="text-sm">
            Planned lab tasks will be listed here.
          </p>
        </div>
      </template>
    </NTabs>
    <div class="flex justify-center">
      <ButtonUserLogoff
        size="lg"
        class="mt-2 mb-0 w-auto mx-auto"
      />
    </div>
  </div>
</template>
