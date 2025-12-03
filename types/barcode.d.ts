// Barcode detection tracking

export type BarcodeDetection = {
  id: string
  code: string
  format: string
  count: number
  // geometry from latest detection
  lastBox?: number[][]
  lastLine?: { x: number, y: number }[]
  // small ring buffer of recent samples
  samples: Array<{
    box?: number[][]
    line?: { x: number, y: number }[]
  }>
}

// Zxing wrapper types

// Type for an exposed ZxingReader instance
export type ZxingReaderInstance = {
  toggleTorch: () => Promise<void>
  switchCamera: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  togglePause: () => Promise<void>
  state: { running: boolean, usingBack: boolean, torch: boolean }
}

export type CornerPoint = { x: number, y: number }
export type DetectedCode = {
  rawValue: string
  format?: string
  corners?: CornerPoint[]
}

export type QrScannerEvents = {
  /** Fired whenever one or more barcodes are detected on a frame */
  detect: DetectedCode[]
  /** Fired when a fatal error occurs (camera/permission/decoder) */
  error: Error
}

export type ScannerState = {
  running: boolean
  usingBack: boolean
  torch: boolean
}

export type ScannerOptions = {
  /** Prefered formats; used for BarcodeDetector if available. */
  formats?: string[]
  /** Process every Nth frame (throttle). Default: 1 (every frame). */
  frameInterval?: number
  /** Set true to mirror overlay when using front camera. */
  mirrorWhenUser?: boolean
}

// Define the barcode options interface based on JsBarcode documentation
export type BarcodeOptions = {
  format?: string
  width?: number
  height?: number
  displayValue?: boolean
  font?: string
  fontOptions?: string
  fontPosition?: string
  fontSize?: number
  textMargin?: number
  textAlign?: string
  textPosition?: string
  text?: string
  background?: string
  lineColor?: string
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  valid?: (valid: boolean) => void
}
