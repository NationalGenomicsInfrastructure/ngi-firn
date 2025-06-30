import { couchDB } from '../../database/couchdb'
import type { Todo } from '../../../types/productivity'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Query todos for the current user using Mango query
  const todos = await couchDB.queryDocuments<Todo>({
    type: 'todo',
    userId: user.id
  }, ['_id', '_rev', 'type', 'userId', 'title', 'completed', 'createdAt'])

  return todos
})
