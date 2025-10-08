import type { BarcodeFinding } from '../../types/barcode'

/**
 * Composable for managing barcode detection findings
 * Tracks multiple detections of the same barcode and aggregates them
 */

export function useBarcodeFindings() {
  const findingsById = reactive<Record<string, BarcodeFinding>>({})

  /**
   * Normalizes a raw detection result into a BarcodeFinding object
   */
  function normalizeDetection(result: any): BarcodeFinding | null {
    const code: string | undefined = result?.codeResult?.code
    const format: string | undefined = result?.codeResult?.format
    const confidence: number | undefined =
      typeof result?.codeResult?.confidence === 'number'
        ? result.codeResult.confidence
        : undefined

    if (!code || !format) return null

    const id = `${format}:${code}`

    return {
      id,
      code,
      format,
      confidence,
      count: 1,
      lastBox: result?.box,
      lastLine: result?.line,
      samples: [
        {
          confidence,
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
  function upsertFinding(result: any) {
    const normalized = normalizeDetection(result)
    if (!normalized) return

    const existing = findingsById[normalized.id]
    if (!existing) {
      findingsById[normalized.id] = normalized
      return
    }

    existing.count += 1
    existing.confidence = normalized.confidence ?? existing.confidence
    existing.lastBox = normalized.lastBox
    existing.lastLine = normalized.lastLine
    existing.samples.push({
      confidence: normalized.confidence,
      box: normalized.lastBox,
      line: normalized.lastLine,
    })
    if (existing.samples.length > 5) existing.samples.shift()
  }

  /**
   * Removes a finding by its ID
   */
  function removeFinding(id: string) {
    if (id in findingsById) delete findingsById[id]
  }

  /**
   * Clears all findings
   */
  function clearFindings() {
    for (const key of Object.keys(findingsById)) delete findingsById[key]
  }

  /**
   * Gets the code of the barcode with the most detections
   */
  const topFindingCode = computed(() => {
    const items = Object.values(findingsById)
    if (!items || items.length === 0) return ''
    let top: BarcodeFinding | null = null
    for (let i = 0; i < items.length; i++) {
      const current: BarcodeFinding = items[i] as BarcodeFinding
      if (!top || current.count > top.count) top = current
    }
    return top ? top.code : ''
  })

  /**
   * Gets the count of unique findings
   */
  const findingsCount = computed(() => Object.keys(findingsById).length)

  /**
   * Gets all findings sorted by detection count (descending)
   */
  const sortedFindings = computed(() =>
    Object.values(findingsById).sort((a, b) => b.count - a.count)
  )

  return {
    findingsById,
    upsertFinding,
    removeFinding,
    clearFindings,
    topFindingCode,
    findingsCount,
    sortedFindings,
  }
}

