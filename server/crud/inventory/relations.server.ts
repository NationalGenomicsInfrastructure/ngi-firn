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
  SerializedUserRef,
  StorageEquipment
} from '../../../types/inventory'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import { couchDB } from '../../database/couchdb'

/* Build a TypedDocumentReference from a parent entity for the `parent` field. */
export function toParentRef<T extends Room | StorageEquipment | Container>(entity: T): TypedDocumentReference<T> {
  return { db: 'firn', id: entity._id, type: entity.type } as TypedDocumentReference<T>
}

/* Build a TypedDocumentReference from a FirnUser for the Action log entries. */
export function toUserRef<T extends FirnUser>(entity: T): TypedDocumentReference<T> {
  return { db: 'firn', id: entity._id, type: entity.type } as TypedDocumentReference<T>
}

/* Placeholder stub used when a log entry's user document can no longer be resolved. */
const UNKNOWN_USER_REF: SerializedUserRef = { firnId: '', name: 'Unknown user', avatar: null }

/* Map a resolved FirnUser document to its client-safe display stub (never exposes the _id). */
function toSerializedUserRef(user: FirnUser): SerializedUserRef {
  const name = user.googleName?.trim()
    || [user.googleGivenName, user.googleFamilyName].filter(Boolean).join(' ').trim()
    || user.githubName?.trim()
    || user.firnId
  return {
    firnId: user.firnId,
    name,
    avatar: user.googleAvatar ?? user.githubAvatar ?? null
  }
}

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
  const userMap = new Map<string, SerializedUserRef>()
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
