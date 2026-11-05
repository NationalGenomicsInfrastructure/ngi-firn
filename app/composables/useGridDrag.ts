import { useEventListener } from '@vueuse/core'

/*
 * Pointer-event based drag session shared by grid cells and list rows (works for mouse AND touch,
 * unlike HTML5 drag and drop). Anything can call `startDrag` on pointerdown; on release the
 * element under the pointer is inspected for the closest `[data-grid-cell]` and a bubbling
 * `grid-drop` CustomEvent is dispatched on it, so the grid component handles it declaratively.
 */

export interface GridDragPayload {
  kind: 'container' | 'item'
  slug: string
  label: string
  /* Slug of the grid container the child currently sits in (null when dragged from elsewhere). */
  fromParentSlug: string | null
}

export interface GridDropDetail {
  payload: GridDragPayload
  level: number
  row: number
  column: number
  gridId: string
}

const DRAG_THRESHOLD_PX = 5

const payload = ref<GridDragPayload | null>(null)
const pointer = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const overCell = ref<{ gridId: string, level: number, row: number, column: number } | null>(null)

let origin = { x: 0, y: 0 }
let onSuppressedClick: ((event: MouseEvent) => void) | null = null

function cellAt(x: number, y: number): HTMLElement | null {
  return (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-grid-cell]') ?? null
}

function readCell(element: HTMLElement | null) {
  if (!element) return null
  const { gridId, level, row, column } = element.dataset
  if (!gridId || !level || !row || !column) return null
  return { gridId, level: Number(level), row: Number(row), column: Number(column) }
}

function reset() {
  payload.value = null
  isDragging.value = false
  overCell.value = null
}

export function useGridDrag() {
  /* Begin a potential drag. It only becomes a drag after the pointer moved past a small threshold. */
  function startDrag(event: PointerEvent, dragPayload: GridDragPayload) {
    if (event.button !== 0) return
    payload.value = dragPayload
    pointer.value = { x: event.clientX, y: event.clientY }
    origin = { x: event.clientX, y: event.clientY }
    isDragging.value = false
  }

  if (import.meta.client) {
    useEventListener(window, 'pointermove', (event: PointerEvent) => {
      if (!payload.value) return
      pointer.value = { x: event.clientX, y: event.clientY }
      if (!isDragging.value) {
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < DRAG_THRESHOLD_PX) return
        isDragging.value = true
      }
      overCell.value = readCell(cellAt(event.clientX, event.clientY))
    })

    useEventListener(window, 'pointerup', (event: PointerEvent) => {
      if (!payload.value) return
      const wasDragging = isDragging.value
      const dragPayload = payload.value
      const target = wasDragging ? cellAt(event.clientX, event.clientY) : null
      reset()
      if (!wasDragging) return

      // A drag must not also fire the click handler of the element it started on.
      onSuppressedClick = (clickEvent: MouseEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
      }
      window.addEventListener('click', onSuppressedClick, { capture: true, once: true })
      setTimeout(() => {
        if (onSuppressedClick) window.removeEventListener('click', onSuppressedClick, true)
        onSuppressedClick = null
      }, 0)

      const cell = readCell(target)
      if (target && cell) {
        target.dispatchEvent(new CustomEvent<GridDropDetail>('grid-drop', {
          bubbles: true,
          detail: { payload: dragPayload, ...cell }
        }))
      }
    })

    useEventListener(window, 'pointercancel', () => reset())
    useEventListener(window, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset()
    })
  }

  return { payload, pointer, isDragging, overCell, startDrag }
}
