import { useDB } from '../../utils/db'
import type { Todo } from '../../../types/productivity'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Query todos for the current user
  const todos = await useDB().queryDocuments<Todo>({
    type: 'todo',
    userId: user.id
  }, ['_id', '_rev', 'type', 'userId', 'title', 'completed', 'createdAt'])

  return todos
})
