import type { CustomTableLayout, Margins, TDocumentDefinitions } from 'pdfmake/interfaces'
import { loadBarcodeDependencies, renderBarcodeDataUrl } from '~/utils/barcodeRendering'
import {
  BARCODE_ACTION_MNEMONICS,
  BARCODE_FOR_ACTION,
  parseBarcode
} from '~~/schemas/inventory/barcode'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import {
  LABEL_SHEET_PRESETS,
  computeSheetLayout,
  cutMarkSegments
} from '~/utils/inventory/labelSheet'
import type { LabelSheetPresetId } from '~/utils/inventory/labelSheet'

export interface LabelSheetEntry {
  code: string
  caption: string
}

/*
 * Rendering of inventory barcodes.
 * ********************************
 *
 * Inventory labels are printed far smaller than the login-token sheets, so they use
 * a denser symbol. Single labels get a label-sized page; batches are arranged as a
 * grid on A4 with cut marks (see buildLabelSheetDoc). The human-readable code is
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
   *
   * An optional subset may be supplied to print only some cards; whatever is passed
   * is always emitted in canonical mnemonic order, so two prints of the same
   * selection are byte-for-byte identical regardless of the order it was picked in.
   */
  async function buildActionSheetDoc(selected?: InventoryActionType[]) {
    const allActions = Object.keys(BARCODE_ACTION_MNEMONICS) as InventoryActionType[]
    const wanted = selected ? new Set(selected) : null
    const actions = wanted ? allActions.filter(action => wanted.has(action)) : allActions

    if (actions.length === 0) {
      throw new Error('Select at least one action card to print.')
    }

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
        // pdfmake has no vertical cell alignment, so the label's top margin is what
        // centres it against the ~50 pt barcode; it has to track the row padding below.
        { text: action.replace('_', ' '), bold: true, margin: [0, 26, 0, 0] as Margins },
        { image, fit: [180, 50] as [number, number], alignment: 'right' as const }
      ]
    }))

    // Taller rows than the stock lightHorizontalLines layout: generous top/bottom
    // padding stops consecutive barcodes from crowding each other, with a faint rule
    // only between rows (not around the outer edge) and no vertical rules.
    const sheetLayout: CustomTableLayout = {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 1),
      vLineWidth: () => 0,
      hLineColor: () => '#e5e7eb',
      paddingTop: () => 12,
      paddingBottom: () => 12,
      paddingLeft: () => 0,
      paddingRight: () => 0
    }

    return {
      content: [
        { text: 'Firn inventory action cards', style: 'header' as const },
        {
          text: 'Including such a barcode in a scanned set allows to control the actions applied to the scanned entities. Scanning entities with no action card checks them out, or returns them if they are already checked out.',
          fontSize: 9,
          color: 'gray',
          margin: [0, 0, 0, 10] as Margins
        },
        {
          table: { widths: ['*', 'auto'], body: rows },
          layout: sheetLayout
        }
      ],
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 0, 0, 6] as Margins }
      },
      defaultStyle: { fontSize: 10 }
    }
  }

  async function downloadActionSheet(selected?: InventoryActionType[]) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildActionSheetDoc(selected)
    pdfMake.createPdf(doc as TDocumentDefinitions).download('firn-action-cards.pdf')
  }

  async function previewActionSheet(selected?: InventoryActionType[]) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildActionSheetDoc(selected)
    pdfMake.createPdf(doc as TDocumentDefinitions).open()
  }

  /*
   * Build a batch sheet of labels on A4 with cut marks.
   *
   * Duplicate codes are printed once, in the order given. Geometry comes from
   * computeSheetLayout; each page is its own fixed-size table, so a full page never
   * reflows into the next one.
   */
  async function buildLabelSheetDoc(labels: LabelSheetEntry[], presetId: LabelSheetPresetId) {
    const preset = LABEL_SHEET_PRESETS[presetId]
    const seen = new Set<string>()
    const unique = labels.filter((label) => {
      if (seen.has(label.code)) return false
      seen.add(label.code)
      return true
    })

    if (unique.length === 0) {
      throw new Error('Select at least one entity with a barcode to print.')
    }

    const layout = computeSheetLayout(preset, unique.length)
    const captionHeight = preset.showCaption ? 8 : 0
    const fit: [number, number] = [layout.labelWidth - 2, layout.cellHeight - 2 - captionHeight]

    const images = await Promise.all(unique.map(label => renderBarcodeDataUrl(label.code, {
      ...preset.render,
      displayValue: true
    })))

    const cellFor = (index: number) => {
      const label = unique[index]
      if (!label) return { text: '' }
      const symbol = { image: images[index]!, fit, alignment: 'center' as const }
      if (!preset.showCaption) return symbol
      const caption = label.caption.length > preset.captionMaxChars
        ? `${label.caption.slice(0, preset.captionMaxChars - 1)}…`
        : label.caption
      return {
        stack: [
          { text: caption, fontSize: 5, bold: true, alignment: 'center' as const, noWrap: true, margin: [0, 1, 0, 0] as Margins },
          symbol
        ]
      }
    }

    const content = layout.pages.map((page, pageIndex) => {
      const body = Array.from({ length: page.usedRows }, (_, row) =>
        Array.from({ length: layout.cols }, (_, col) => cellFor(page.start + row * layout.cols + col)))
      return {
        table: {
          widths: Array.from({ length: layout.cols }, () => layout.cellWidth),
          heights: layout.cellHeight,
          body,
          dontBreakRows: true
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        } as CustomTableLayout,
        ...(pageIndex > 0 ? { pageBreak: 'before' as const } : {})
      }
    })

    return {
      pageSize: 'A4' as const,
      pageMargins: [layout.gridX, layout.gridY, layout.gridX, layout.gridY] as Margins,
      background: (currentPage: number) => ({
        canvas: cutMarkSegments(layout, currentPage - 1).map(mark => ({
          type: 'line' as const,
          ...mark,
          lineWidth: 0.4,
          lineColor: '#000000'
        }))
      }),
      content,
      defaultStyle: { fontSize: 6 }
    }
  }

  async function previewLabelSheet(labels: LabelSheetEntry[], presetId: LabelSheetPresetId) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildLabelSheetDoc(labels, presetId)
    pdfMake.createPdf(doc as TDocumentDefinitions).open()
  }

  async function downloadLabelSheet(labels: LabelSheetEntry[], presetId: LabelSheetPresetId) {
    const { pdfMake } = await loadBarcodeDependencies()
    const doc = await buildLabelSheetDoc(labels, presetId)
    pdfMake.createPdf(doc as TDocumentDefinitions).download('firn-barcode-labels.pdf')
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
    previewLabelSheet,
    downloadLabelSheet,
    describeCode
  }
}
