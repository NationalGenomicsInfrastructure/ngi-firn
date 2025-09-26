import QRCode from 'qrcode'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Margins, TDocumentDefinitions } from 'pdfmake/interfaces'

pdfMake.vfs = pdfFonts.vfs

export function useTokenQR() {
// Build a PDF document with a QR code and a user name
  async function buildDoc(token: string, tokenID: string, userName: string) {
    const qrDataUrl = await QRCode.toDataURL(token)

    return {
      content: [
        { text: `Firn Token of ${userName}`, style: 'header' as const },
        {
          image: qrDataUrl,
          width: 100,
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

  // Download the QR code as a PDF
  async function downloadTokenQR(token: string, tokenID: string, userName: string) {
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).download('token.pdf')
  }

  // Preview the QR code in a new tab
  async function previewTokenQR(token: string, tokenID: string, userName: string) {
    const docDefinition = await buildDoc(token, tokenID, userName)
    pdfMake.createPdf(docDefinition as TDocumentDefinitions).open()
  }

  return { downloadTokenQR, previewTokenQR }
}
