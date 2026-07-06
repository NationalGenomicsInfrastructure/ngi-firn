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
import type { TypedDocumentReference } from '../../../types/references'

/* Build a TypedDocumentReference from a parent entity for the `parent` field. */
export function toParentRef<T extends Room | StorageEquipment | Container>(entity: T): TypedDocumentReference<T> {
  return { db: 'firn', id: entity._id, type: entity.type } as TypedDocumentReference<T>
}
