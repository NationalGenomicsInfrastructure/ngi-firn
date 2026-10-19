import { always, eventually } from '@antithesishq/bombadil'
import { actions, extract, getFingerprint, registerCustomAction, weighted } from '@antithesishq/bombadil/browser'
import { clicks, inputs, reload, scroll, waitOnce } from '@antithesishq/bombadil/browser/defaults/actions'
import { filterActions, safeClick } from './actions.ts'
import { excludedControl, scannerState } from './scanner.ts'

export {
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  noConsoleErrors
} from '@antithesishq/bombadil/browser/defaults/properties'

const onScannerPage = extract(state => state.window.location.pathname === '/scan')
const scanner = extract(state => scannerState(state.document))

const forbiddenClicks = extract(state =>
  Array.from(state.document.querySelectorAll('button, a'))
    .filter(element => excludedControl(element, state.window.location.href))
    .map(element => JSON.stringify(getFingerprint(element)))
)

const fixture = extract((state) => {
  if (state.window.location.pathname !== '/scan') return { codes: [], captureFocused: false }
  const raw: unknown = JSON.parse(new URL(state.window.location.href).searchParams.get('bombadilCodes') ?? '[]')
  if (!Array.isArray(raw) || raw.length !== 5 || !raw.every(code => typeof code === 'string' && code.length > 0)) {
    throw new Error('Missing fixture barcodes: start the pilot through tests/bombadil/run.sh.')
  }
  const input = state.document.activeElement
  return {
    codes: raw as string[],
    captureFocused: input instanceof HTMLInputElement
      && (input.placeholder === 'Scan one barcode' || input.placeholder === 'Scan items, containers, locations or an action card')
  }
})

const scannerClicks = actions(() => filterActions(clicks.generate(), action => safeClick(action, forbiddenClicks.current)))
const scanCode = registerCustomAction('scanFixtureBarcode', async (document, _window, code: string) => {
  const input = document.activeElement
  if (!(input instanceof HTMLInputElement) || !input.form) {
    throw new Error('Fixture scan lost its capture input.')
  }
  // One complete scan, not several random strings concatenated before debounce.
  input.value = code
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.form.requestSubmit()
})
const fixtureInputs = actions(() => fixture.current.captureFocused
  ? fixture.current.codes.map(code => scanCode(code))
  : [])

// Keep malformed text and Enter, but bias capture toward real fixture entities.
// Reload is safe; history navigation and logout are not part of this pilot.
const exploration = weighted([
  [20, scannerClicks],
  [20, fixtureInputs],
  [5, inputs],
  [5, scroll],
  [5, waitOnce],
  [1, reload]
])

// A native form submit before Vue hydration would reload the SSR page instead of scanning.
export const scannerActions = actions(() => scanner.current.interactive ? exploration.generate() : ['Wait'])
export const scannerBecomesInteractive = always(() => eventually(() => scanner.current.interactive).within(30, 'seconds'))
export const staysOnScanner = always(() => onScannerPage.current)
export const scannerFrameRendered = always(() => !onScannerPage.current || scanner.current.heading)
export const singleTabPanel = always(() => !onScannerPage.current || scanner.current.panels === 1)
export const infoTabHasScanner = always(() => !onScannerPage.current || scanner.current.readerReady)
