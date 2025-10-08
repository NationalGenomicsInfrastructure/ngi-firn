export type BarcodeDetection = {
    id: string
    code: string
    format: string
    confidence?: number
    count: number
    // geometry from latest detection
    lastBox?: unknown
    lastLine?: unknown
    // small ring buffer of recent samples
    samples: Array<{
      confidence?: number
      box?: unknown
      line?: unknown
    }>
  }