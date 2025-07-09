import { useDB, type Todo } from '../../crud/indices'

export default eventHandler(async () => {
  // Get all todo documents
  const todos = await useDB().queryDocuments<Todo>({
    type: 'todo'
  }, ['userId'])

  // Count total todos
  const totalTodos = todos.length

  // Count unique users
  const uniqueUsers = new Set(todos.map(todo => todo.userId)).size

  return {
    todos: totalTodos,
    users: uniqueUsers
  }
})
