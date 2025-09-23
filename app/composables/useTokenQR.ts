import QRCode from 'qrcode'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Margins, TDocumentDefinitions } from 'pdfmake/interfaces'

pdfMake.vfs = pdfFonts.vfs

export function useTokenQR() {
// Build a PDF document with a QR code and a user name
  async function buildDoc(token: string, userName: string) {
    const qrDataUrl = await QRCode.toDataURL(token)

    return {
      content: [
        { text: 'Firn Token', style: 'header' as const },
        {
          image: qrDataUrl,
          width: 200,
          alignment: 'center' as const,
          margin: [0, 20, 0, 20] as Margins
        },
        { text: userName, fontSize: 12, color: 'gray', alignment: 'center' as const }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          alignment: 'center' as const,
          margin: [0, 0, 0, 10] as Margins
        }
      },
      defaultStyle: {
        fontSize: 12
      }
    }
  }

  // Download the QR code as a PDF
  async function downloadTokenQR(token: string, userName: string) {
    const docDefinition = await buildDoc(token, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).download('token.pdf')
  }

  // Preview the QR code in a new tab
  async function previewTokenQR(token: string, userName: string) {
    const docDefinition = await buildDoc(token, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).open()
  }

  return { downloadTokenQR, previewTokenQR }
}
