import { useDB, type Todo } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Query todos for the current user using Mango query
  const todos = await useDB().queryDocuments<Todo>({
    type: 'todo',
    userId: user.id
  }, ['_id', '_rev', 'type', 'userId', 'title', 'completed', 'createdAt'])

  return todos
})
