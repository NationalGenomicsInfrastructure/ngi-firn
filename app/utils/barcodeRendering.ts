/*
 * Shared Code 128 rendering.
 * **************************
 *
 * Both login tokens and inventory labels are Code 128, but they are printed at very
 * different sizes: a token sheet is read by a handheld scanner across a desk, while
 * an inventory label has to fit on a cryovial. Only the canvas rendering and the
 * lazy loading of the browser-only libraries are genuinely common, so that is all
 * this module holds — the page layouts stay with their respective composables.
 */

/*
 * pdfmake and JsBarcode both touch `document`, so they are imported lazily to keep
 * them out of the server bundle and off the initial client payload.
 */
export async function loadBarcodeDependencies() {
  const [{ default: JsBarcode }, { default: pdfMake }, pdfFontsModule] = await Promise.all([
    import('jsbarcode'),
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts')
  ])
  // The pdfmake bundle only has a default export; addVirtualFileSystem is a method on that instance.
  ;(pdfMake as { addVirtualFileSystem: (vfs: Record<string, unknown>) => void })
    .addVirtualFileSystem(pdfFontsModule.default)
  return { JsBarcode, pdfMake }
}

export interface BarcodeRenderOptions {
  /* Width of a single narrow bar, in canvas pixels. Drives the overall width. */
  width?: number
  /* Bar height in canvas pixels. */
  height?: number
  /* Whether JsBarcode prints the human-readable value beneath the bars. */
  displayValue?: boolean
  /* Quiet zone around the symbol. Scanners need it; do not set it to 0. */
  margin?: number
  fontSize?: number
}

/*
 * Render a Code 128 symbol to a PNG data URL.
 *
 * Throws rather than returning an empty string for an unencodable value, so a
 * caller cannot silently render a blank label and print it.
 */
export async function renderBarcodeDataUrl(
  value: string,
  options: BarcodeRenderOptions = {}
): Promise<string> {
  const { JsBarcode } = await loadBarcodeDependencies()

  const canvas = document.createElement('canvas')
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: options.width ?? 3,
    height: options.height ?? 150,
    displayValue: options.displayValue ?? false,
    margin: options.margin ?? 5,
    fontSize: options.fontSize ?? 12
  })

  return canvas.toDataURL('image/png')
}
