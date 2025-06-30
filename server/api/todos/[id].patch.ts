import { useValidatedParams, useValidatedBody, z, zh } from 'h3-zod'
import { couchDB } from '../../database/couchdb'
import type { Todo } from '../../../types/productivity'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const { completed } = await useValidatedBody(event, {
    completed: z.number().int().min(0).max(1)
  })
  const { user } = await requireUserSession(event)

  // Convert numeric ID to string for CouchDB
  const documentId = id.toString()

  // First, get the existing todo to verify ownership and get the current rev
  const existingTodo = await couchDB.getDocument<Todo>(documentId)
  
  if (!existingTodo) {
    throw createError({
      statusCode: 404,
      message: 'Todo not found'
    })
  }

  if (existingTodo.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: 'Not authorized to update this todo'
    })
  }

  if (existingTodo.type !== 'todo') {
    throw createError({
      statusCode: 400,
      message: 'Invalid document type'
    })
  }

  // Update the todo document
  const updatedTodo: Todo = {
    ...existingTodo,
    completed
  }

  const result = await couchDB.updateDocument(documentId, updatedTodo, existingTodo._rev!)
  
  return {
    ...updatedTodo,
    _id: result.id,
    _rev: result.rev
  }
})
