import type { BarcodeDetection, QuaggaJSResultObject } from '../../types/barcode'

/**
 * Composable for managing barcode detection findings
 * Tracks multiple detections of the same barcode and aggregates them
 */

export function useBarcodeDetections() {
  const findingsById = reactive<Record<string, BarcodeDetection>>({})

  /**
   * Normalizes a raw detection result into a BarcodeDetection object
   */
  function normalizeDetection(result: QuaggaJSResultObject): BarcodeDetection | null {
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
   * Updates or inserts a finding based on a detection result
   * Aggregates multiple detections of the same barcode
   */
  function upsertDetection(result: QuaggaJSResultObject) {
    const normalized = normalizeDetection(result)
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
   * Gets the code of the barcode with the most detections
   */
  const mostDetectedCode = computed(() => {
    const items = Object.values(findingsById)
    if (!items || items.length === 0) return ''
    let top: BarcodeDetection | undefined
    items.sort((a, b) => b.count - a.count)
    top = items[0]
    return top ? top.code : ''
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
    upsertDetection,
    removeDetection,
    clearDetections,
    mostDetectedCode,
    detectionCount,
    sortedDetections,
  }
}

