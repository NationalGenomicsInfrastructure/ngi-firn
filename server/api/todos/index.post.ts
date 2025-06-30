import { useValidatedBody, z } from 'h3-zod'
import { useDB, type Todo } from '../../utils/db'

export default eventHandler(async (event) => {
  const { title } = await useValidatedBody(event, {
    title: z.string().min(1).max(100)
  })
  const { user } = await requireUserSession(event)

  // Create new todo document
  const todo: Omit<Todo, '_id' | '_rev'> = {
    type: 'todo',
    userId: user.id,
    title,
    completed: 0,
    createdAt: new Date().toISOString()
  }

  const result = await useDB().createDocument(todo)

  // Return the created todo with the generated ID and rev
  return {
    _id: result.id,
    _rev: result.rev,
    ...todo
  }
})
