import { useValidatedParams, zh } from 'h3-zod'
import { couchDB } from '../../database/couchdb'
import type { Todo } from '../../../types/productivity'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
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
      message: 'Not authorized to delete this todo'
    })
  }

  if (existingTodo.type !== 'todo') {
    throw createError({
      statusCode: 400,
      message: 'Invalid document type'
    })
  }

  // Delete the todo document
  await couchDB.deleteDocument(documentId, existingTodo._rev!)

  return existingTodo
})
