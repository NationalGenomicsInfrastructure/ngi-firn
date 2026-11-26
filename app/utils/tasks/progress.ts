import type { TaskProgressSummary } from '~~/types/productivity'

/* Steps still relevant for progress: cancelled steps drop out of the denominator. */
export function taskProgress(
  { total, cancelled, completed, skipped }: Pick<TaskProgressSummary, 'total' | 'cancelled' | 'completed' | 'skipped'>
) {
  return { done: completed + skipped, of: total - cancelled }
}
