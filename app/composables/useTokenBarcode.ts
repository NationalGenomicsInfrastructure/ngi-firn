import JsBarcode from 'jsbarcode'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Margins, TDocumentDefinitions } from 'pdfmake/interfaces'

pdfMake.vfs = pdfFonts.vfs

export function useTokenBarcode() {
  // Generate barcode as data URL using JSBarcode
  async function generateBarcodeDataUrl(token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Create a temporary canvas element
        const canvas = document.createElement('canvas')
        
        // Generate barcode on canvas
        JsBarcode(canvas, token, {
          format: 'CODE128',
          width: 3,
          height: 150,
          displayValue: false,
          margin: 5
        })
        
        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png')
        resolve(dataUrl)
      } catch (error) {
        reject(error)
      }
    })
  }

  // Build a PDF document with a barcode and a user name
  async function buildDoc(token: string, tokenID: string, userName: string) {
    const barcodeDataUrl = await generateBarcodeDataUrl(token)

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
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).download('token.pdf')
  }

  // Preview the barcode in a new tab
  async function previewTokenBarcode(token: string, tokenID: string, userName: string) {
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).open()
  }

  return { downloadTokenBarcode, previewTokenBarcode }
}
