import type { TaskImportance, TaskVisibility } from '~~/schemas/tasks/enums'

export type TaskOptionTone = 'primary' | 'gray'

export interface TaskOption<T extends string> {
  value: T
  label: string
  description: string
  icon: string
  tone: TaskOptionTone
}

export const TASK_IMPORTANCE_OPTIONS: TaskOption<TaskImportance>[] = [
  { value: 'ordinary', label: 'Ordinary', description: 'Routine work without special priority', icon: 'i-lucide-circle', tone: 'gray' },
  { value: 'important', label: 'Important', description: 'Stands out in task lists and priority views', icon: 'i-lucide-flag', tone: 'primary' }
]

export const TASK_VISIBILITY_OPTIONS: TaskOption<TaskVisibility>[] = [
  { value: 'private', label: 'Private', description: 'Owner, responsible users and viewers', icon: 'i-lucide-lock', tone: 'gray' },
  { value: 'public', label: 'Public', description: 'Every Firn user can claim this task', icon: 'i-lucide-globe', tone: 'primary' }
]

export function taskOptionLabel<T extends string>(options: TaskOption<T>[], value: T | undefined): string {
  return options.find(option => option.value === value)?.label ?? '—'
}
