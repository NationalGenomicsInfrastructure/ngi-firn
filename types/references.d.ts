import type { BaseDocument } from '../server/database/couchdb'

// =============================================================================================
// Generic cross-database document references (graph-like links between CouchDB documents)
// =============================================================================================

/**
 * Logical database name for a referenced document, future-proof for additional databases.
 *
 * - `'firn'` is the default application database.
 * - `'projects'` is the external projects database.
 */
export type DocumentDatabaseName = 'firn' | 'projects' | (string & {})

// Minimal, robust reference to another CouchDB/Cloudant document.
export interface DocumentReference {
  // Logical database name where the target document lives.
  db: DocumentDatabaseName
  // Target document ID (the `_id` field of the document in the target database).
  id: string
  // Optional revision of the target document.
  rev?: string
  // Optional type discriminator for the target document (e.g. 'firnUser', 'project').
  type?: string
}

/**
 * Strongly-typed variant of `DocumentReference` that allows you to express
 * the expected target document type at the type level while still storing
 * a compact runtime structure.
 *
 * Example:
 *   const ref: TypedDocumentReference<FirnUser> = { db: 'firn', id: 'user:123' }
 */
export type TypedDocumentReference<TDoc extends BaseDocument = BaseDocument>
  = Omit<DocumentReference, 'type'> & {
    type?: TDoc extends { type: infer TType extends string } ? TType : string
  }

/**
 * Collection helpers for common shapes of references.
 */
export type DocumentReferenceList = DocumentReference[]
export type DocumentReferenceMap = Record<string, DocumentReference | DocumentReferenceList>

/**
 * Optional edge-style link with a semantic relation label.
 * This is useful if you want to model an explicit graph of documents.
 */
export interface DocumentEdge {
  from: DocumentReference
  to: DocumentReference
  /**
   * Relation label, e.g. 'parent', 'child', 'dependsOn', 'derivedFrom', 'relatedTo'.
   */
  relation?: string
}
