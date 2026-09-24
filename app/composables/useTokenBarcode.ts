import type { Margins, TDocumentDefinitions } from 'pdfmake/interfaces'
import { loadBarcodeDependencies, renderBarcodeDataUrl } from '~/utils/barcodeRendering'

export function useTokenBarcode() {
  // Build a PDF document with a barcode and a user name
  async function buildDoc(token: string, tokenID: string, userName: string) {
    const barcodeDataUrl = await renderBarcodeDataUrl(token, {
      width: 3,
      height: 150,
      displayValue: false,
      margin: 5
    })

    return {
      content: [
        { text: `Firn Token of ${userName}`, style: 'header' as const },
        {
          image: barcodeDataUrl,
          width: 250,
          alignment: 'center' as const,
          margin: [0, 0, 0, 0] as Margins
        },
        { text: tokenID, fontSize: 10, color: 'gray', alignment: 'center' as const }
      ],
      styles: {
        header: {
          fontSize: 12,
          bold: true,
          alignment: 'center' as const,
          margin: [0, 0, 0, 0] as Margins
        }
      },
      defaultStyle: {
        fontSize: 10
      }
    }
  }

  // Download the barcode as a PDF
  async function downloadTokenBarcode(token: string, tokenID: string, userName: string) {
    const { pdfMake } = await loadBarcodeDependencies()
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).download('token.pdf')
  }

  // Preview the barcode in a new tab
  async function previewTokenBarcode(token: string, tokenID: string, userName: string) {
    const { pdfMake } = await loadBarcodeDependencies()
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).open()
  }

  return { downloadTokenBarcode, previewTokenBarcode }
}
