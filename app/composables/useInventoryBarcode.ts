import type { Margins, TDocumentDefinitions } from 'pdfmake/interfaces'
import { loadBarcodeDependencies, renderBarcodeDataUrl } from '~/utils/barcodeRendering'
import {
  BARCODE_ACTION_MNEMONICS,
  BARCODE_FOR_ACTION,
  parseBarcode
} from '~~/schemas/inventory/barcode'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'

/*
 * Rendering of inventory barcodes.
 * ********************************
 *
 * Inventory labels are printed far smaller than the login-token sheets, so they use
 * a denser symbol and a label-sized page rather than A4. The human-readable code is
 * printed beneath the bars here — unlike on token sheets — because a damaged
 * inventory label still has to be enterable by hand.
 *
 * The dedicated label printer is not wired up yet; until it is, these PDFs are the
 * interchange format.
 */

/* Label geometry in PostScript points (1 pt = 1/72 inch). Roughly 50 x 25 mm. */
const LABEL_WIDTH = 142
const LABEL_HEIGHT = 71
const LABEL_MARGIN = 6

export function useInventoryBarcode() {
  /*
   * Render a code for on-screen display.
   *
   * Uses a short, dense symbol because the detail pages show it inline at roughly
   * label size rather than full width.
   */
  async function previewDataUrl(code: string): Promise<string> {
    return await renderBarcodeDataUrl(code, {
      width: 2,
      height: 60,
      displayValue: true,
      margin: 4,
      fontSize: 14
    })
  }

  async function buildLabelDoc(code: string, caption: string) {
    const image = await renderBarcodeDataUrl(code, {
      width: 2,
      height: 50,
      displayValue: true,
      margin: 2,
      fontSize: 14
    })

    return {
      pageSize: { width: LABEL_WIDTH, height: LABEL_HEIGHT },
      pageMargins: [LABEL_MARGIN, LABEL_MARGIN, LABEL_MARGIN, LABEL_MARGIN] as Margins,
      content: [
        {
          text: caption,
          fontSize: 6,
          bold: true,
          alignment: 'center' as const,
          margin: [0, 0, 0, 2] as Margins
        },
        {
          image,
          fit: [LABEL_WIDTH - 2 * LABEL_MARGIN, LABEL_HEIGHT - 2 * LABEL_MARGIN - 10],
          alignment: 'center' as const
        }
      ],
      defaultStyle: { fontSize: 6 }
    }
  }

  /* Open a single entity label in a new tab, for checking before printing. */
  async function previewLabel(code: string, caption: string) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildLabelDoc(code, caption)
    pdfMake.createPdf(doc as TDocumentDefinitions).open()
  }

  async function downloadLabel(code: string, caption: string) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildLabelDoc(code, caption)
    pdfMake.createPdf(doc as TDocumentDefinitions).download(`${code}.pdf`)
  }

  /*
   * Build the action reference sheet.
   *
   * Action barcodes are deterministic and backed by no documents, so this sheet can
   * be printed once and stays valid indefinitely. It is what makes the scan-only
   * workflow usable for anything beyond the default check-out/return toggle.
   */
  async function buildActionSheetDoc() {
    const actions = Object.keys(BARCODE_ACTION_MNEMONICS) as InventoryActionType[]

    const rows = await Promise.all(actions.map(async (action) => {
      const code = BARCODE_FOR_ACTION[action]
      const image = await renderBarcodeDataUrl(code, {
        width: 2,
        height: 50,
        displayValue: true,
        margin: 4,
        fontSize: 12
      })
      return [
        { text: action.replace('_', ' '), bold: true, margin: [0, 14, 0, 0] as Margins },
        { image, fit: [180, 50] as [number, number], alignment: 'right' as const }
      ]
    }))

    return {
      content: [
        { text: 'Firn inventory action cards', style: 'header' as const },
        {
          text: 'Include one of these in a scanned set to say what should happen to the entities scanned with it. Scanning entities with no action card checks them out, or returns them if they are already checked out.',
          fontSize: 9,
          color: 'gray',
          margin: [0, 0, 0, 10] as Margins
        },
        {
          table: { widths: ['*', 'auto'], body: rows },
          layout: 'lightHorizontalLines'
        }
      ],
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 0, 0, 6] as Margins }
      },
      defaultStyle: { fontSize: 10 }
    }
  }

  async function downloadActionSheet() {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildActionSheetDoc()
    pdfMake.createPdf(doc as TDocumentDefinitions).download('firn-action-cards.pdf')
  }

  async function previewActionSheet() {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildActionSheetDoc()
    pdfMake.createPdf(doc as TDocumentDefinitions).open()
  }

  /*
   * Describe a code for display. Lets the UI label an externally supplied vendor
   * barcode as such, rather than implying Firn issued it.
   */
  function describeCode(code: string | null | undefined) {
    if (!code) return { label: 'No barcode', isFirnIssued: false, isExternal: false }

    const parsed = parseBarcode(code)
    if (parsed.kind === 'entity') {
      return { label: 'Firn barcode', isFirnIssued: true, isExternal: false }
    }
    if (parsed.kind === 'action') {
      return { label: 'Action card', isFirnIssued: true, isExternal: false }
    }
    if (parsed.kind === 'foreign') {
      return { label: 'External label', isFirnIssued: false, isExternal: true }
    }
    return { label: 'Unrecognised barcode', isFirnIssued: false, isExternal: false }
  }

  return {
    previewDataUrl,
    previewLabel,
    downloadLabel,
    previewActionSheet,
    downloadActionSheet,
    describeCode
  }
}
