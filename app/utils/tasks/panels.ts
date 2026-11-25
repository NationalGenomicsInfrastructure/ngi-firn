import type { TaskQuadrant } from '~~/schemas/tasks/enums'
import type { DisplayTask } from '~~/types/productivity'

/* The four panels of the task array: one per backend priority quadrant. */
export interface TaskPanel {
  id: TaskQuadrant
  title: string
  description: string
  icon: string
  emptyText: string
}

export const TASK_PANELS: TaskPanel[] = [
  { id: 'important_urgent', title: 'Crucial', description: 'Important, due soon or left waiting too long', icon: 'i-lucide-flame', emptyText: 'Nothing crucial right now' },
  { id: 'important_not_urgent', title: 'Plan ahead', description: 'Important, no time pressure yet', icon: 'i-lucide-flag', emptyText: 'No important tasks pending' },
  { id: 'ordinary_urgent', title: 'Routine, due soon', description: 'Ordinary, due soon', icon: 'i-lucide-calendar-clock', emptyText: 'No ordinary tasks with a deadline' },
  { id: 'ordinary_not_urgent', title: 'Backlog', description: 'Ordinary, no time pressure yet', icon: 'i-lucide-inbox', emptyText: 'The backlog is empty' }
]

/* Group tasks into panels, keeping the server's order (quadrant, due date, creation). */
export function groupTasksByPanel(tasks: DisplayTask[]): Record<TaskQuadrant, DisplayTask[]> {
  const groups: Record<TaskQuadrant, DisplayTask[]> = {
    important_urgent: [],
    important_not_urgent: [],
    ordinary_urgent: [],
    ordinary_not_urgent: []
  }
  for (const task of tasks) groups[task.quadrant].push(task)
  return groups
}
