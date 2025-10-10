import type { BarcodeDetection, QuaggaJSResultObject, DetectedCode } from '../../types/barcode'

/**
 * Composable for managing barcode detection findings
 * Tracks multiple detections of the same barcode and aggregates them
 * Supports both Quagga2 and ZXing detection formats
 */

export function useBarcodeDetections() {
  const findingsById = reactive<Record<string, BarcodeDetection>>({})

  /**
   * Normalizes a Quagga2 detection result into a BarcodeDetection object
   */
  function normalizeQuaggaDetection(result: QuaggaJSResultObject): BarcodeDetection | null {
    const code: string | null | undefined = result?.codeResult?.code
    const format: string | undefined = result?.codeResult?.format

    if (!code || !format) return null

    const id = `${format}:${code}`

    return {
      id,
      code,
      format,
      count: 1,
      lastBox: result?.box,
      lastLine: result?.line,
      samples: [
        {
          box: result?.box,
          line: result?.line,
        },
      ],
    }
  }

  /**
   * Normalizes a ZXing detection result into a BarcodeDetection object
   */
  function normalizeZxingDetection(result: DetectedCode): BarcodeDetection | null {
    const code: string | undefined = result?.rawValue
    const format: string | undefined = result?.format

    if (!code || !format) return null

    const id = `${format}:${code}`

    // Convert ZXing corners to a format similar to Quagga box
    const box = result?.corners ? result.corners.map(c => [c.x, c.y]) : undefined

    return {
      id,
      code,
      format,
      count: 1,
      lastBox: box,
      lastLine: result?.corners,
      samples: [
        {
          box,
          line: result?.corners,
        },
      ],
    }
  }

  /**
   * Updates or inserts a Quagga2 finding based on a detection result
   */
  function upsertQuaggaDetection(result: QuaggaJSResultObject) {
    const normalized = normalizeQuaggaDetection(result)
    if (!normalized) return

    const existing = findingsById[normalized.id]
    if (!existing) {
      findingsById[normalized.id] = normalized
      return
    }

    existing.count += 1
    existing.lastBox = normalized.lastBox
    existing.lastLine = normalized.lastLine
    existing.samples.push({
      box: normalized.lastBox,
      line: normalized.lastLine,
    })
    if (existing.samples.length > 5) existing.samples.shift()
  }

  /**
   * Updates or inserts a ZXing finding based on a detection result
   */
  function upsertZxingDetection(result: DetectedCode) {
    const normalized = normalizeZxingDetection(result)
    if (!normalized) return

    const existing = findingsById[normalized.id]
    if (!existing) {
      findingsById[normalized.id] = normalized
      return
    }

    existing.count += 1
    existing.lastBox = normalized.lastBox
    existing.lastLine = normalized.lastLine
    existing.samples.push({
      box: normalized.lastBox,
      line: normalized.lastLine,
    })
    if (existing.samples.length > 5) existing.samples.shift()
  }

  /**
   * Removes a finding by its ID
   */
  function removeDetection(id: string) {
    if (id in findingsById) delete findingsById[id]
  }

  /**
   * Clears all findings
   */
  function clearDetections() {
    for (const key of Object.keys(findingsById)) delete findingsById[key]
  }

  /**
   * Gets the full barcode detection with the most detections
   */
  const mostDetectedItem = computed<BarcodeDetection | null>(() => {
    const items = Object.values(findingsById)
    if (!items || items.length === 0) return null
    items.sort((a, b) => b.count - a.count)
    return items[0] || null
  })

  /**
   * Gets the code of the barcode with the most detections
   */
  const mostDetectedCode = computed(() => {
    return mostDetectedItem.value?.code || ''
  })

  /**
   * Gets the count of unique findings
   */
  const detectionCount = computed(() => Object.keys(findingsById).length)

  /**
   * Gets all findings sorted by detection count (descending)
   */
  const sortedDetections = computed(() =>
    Object.values(findingsById).sort((a, b) => b.count - a.count)
  )

  return {
    findingsById,
    upsertQuaggaDetection,
    upsertZxingDetection,
    removeDetection,
    clearDetections,
    mostDetectedItem,
    mostDetectedCode,
    detectionCount,
    sortedDetections,
  }
}

