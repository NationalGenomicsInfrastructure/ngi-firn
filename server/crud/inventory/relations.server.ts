/*
 * Inventory Helpers - Table of Contents
 * ************************************
 *
 */

import type {
  Container,
  Room,
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
