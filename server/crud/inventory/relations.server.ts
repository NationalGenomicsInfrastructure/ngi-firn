/*
 * Inventory Helpers - Table of Contents
 * ************************************
 *
 * REFERENCE BUILDERS:
 * toParentRef(entity) - Build a TypedDocumentReference for the `parent` field of inventory documents
 * toUserRef(entity) - Build a TypedDocumentReference from a FirnUser for action log entries
 *
 * REFERENCE RESOLVERS:
 * resolveActionLogUsers(entries) - Enrich raw action log user references into client-safe SerializedUserRef stubs
 * resolveUserDisplayName(userId) - Resolve a stored user id to a display name (falls back gracefully)
 *
 * CHILD COUNT QUERIES:
 * countDirectChildren(parentDocumentId) - Count direct children via the inventory reduce view
 * hasDirectChildren(parentDocumentId) - Check whether a document has at least one direct child
 */

import type {
  Container,
  DisplayInventoryActionLogEntry,
  InventoryActionLogEntry,
  Room,
  StorageEquipment
} from '../../../types/inventory'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import { couchDB } from '../../database/couchdb'
import { UNKNOWN_USER_REF, resolveUserDisplayName, toSerializedUserRef, toUserRef } from '../users.server'

/* Build a TypedDocumentReference from a parent entity for the `parent` field. */
export function toParentRef<T extends Room | StorageEquipment | Container>(entity: T): TypedDocumentReference<T> {
  return { db: 'firn', id: entity._id, type: entity.type } as TypedDocumentReference<T>
}

// Re-exported from UserService so existing inventory call sites keep importing from here while the
// canonical implementation lives in server/crud/users.server.ts.
export { resolveUserDisplayName, toUserRef }

/*
 * Enrich a list of stored action log entries into their client-safe projection.
 * Distinct user references are resolved in a single batch fetch by CouchDB _id;
 * unresolved users fall back to an "Unknown user" stub. The returned entries carry
 * a SerializedUserRef instead of the raw TypedDocumentReference (no _id leakage).
 */
export async function resolveActionLogUsers(
  entries: InventoryActionLogEntry[]
): Promise<DisplayInventoryActionLogEntry[]> {
  if (entries.length === 0) return []

  const distinctIds = [...new Set(
    entries.map(entry => entry.firnUser?.id).filter((id): id is string => typeof id === 'string')
  )]

  const userDocs = await couchDB.getDocumentsByIds<FirnUser>(distinctIds)
  const userMap = new Map<string, DisplayInventoryActionLogEntry['firnUser']>()
  for (const doc of userDocs) {
    if (doc && doc.type === 'firnUser') {
      userMap.set(doc._id, toSerializedUserRef(doc))
    }
  }

  return entries.map(({ firnUser, ...rest }) => ({
    ...rest,
    firnUser: (firnUser?.id ? userMap.get(firnUser.id) : undefined) ?? UNKNOWN_USER_REF
  }))
}

/* Count direct children of one parent document using the inventory reduce view. */
export async function countDirectChildren(parentDocumentId: string): Promise<number> {
  const result = await couchDB.queryView<string, number>(
    'firn-inventory',
    'children_count',
    {
      key: parentDocumentId,
      reduce: true,
      group: false
    }
  )

  return result.rows[0]?.value ?? 0
}

/* Check whether a document has at least one direct child. */
export async function hasDirectChildren(parentDocumentId: string): Promise<boolean> {
  const childrenCount = await countDirectChildren(parentDocumentId)
  return childrenCount > 0
}
