import { CloudantV1 } from '@ibm-cloud/cloudant'
import { BasicAuthenticator } from 'ibm-cloud-sdk-core'

// CouchDB connection configuration
interface CouchDBConfig {
  url: string
  username?: string
  password?: string
  database: string
}

// Base document interface extending CloudantV1.Document
interface BaseDocument extends CloudantV1.Document {
  _id: string
  _rev?: string
}

// Initialize Cloudant client
function createCloudantClient(config: CouchDBConfig): CloudantV1 {
  console.log('Creating Cloudant client with config:', {
    url: config.url,
    username: config.username ? 'Set' : 'Not set',
    password: config.password ? 'Set' : 'Not set',
    database: config.database
  })

  // Set environment variables for IBM Cloudant SDK
  process.env.CLOUDANT_URL = config.url
  if (config.username) {
    process.env.CLOUDANT_USERNAME = config.username
  }
  if (config.password) {
    process.env.CLOUDANT_PASSWORD = config.password
  }
  // Use COUCHDB_SESSION authentication for username/password
  if (config.username && config.password) {
    process.env.CLOUDANT_AUTH_TYPE = 'COUCHDB_SESSION'
  }

  // Create client using IBM Cloudant SDK pattern
  const client = CloudantV1.newInstance({})
  return client
}

// Database operations
export class CouchDBConnector {
  private client: CloudantV1
  private database: string

  constructor(config?: Partial<CouchDBConfig>) {
    // Load environment variables if not already loaded
    if (!process.env.CLOUDANT_URL) {
      try {
        require('dotenv/config')
      } catch (e) {
        console.warn('dotenv not available, using existing environment variables')
      }
    }

    // Merge config with environment variables
    const finalConfig: CouchDBConfig = {
      url: config?.url || process.env.CLOUDANT_URL || process.env.COUCHDB_URL || 'http://localhost:5984',
      username: config?.username || process.env.CLOUDANT_USERNAME,
      password: config?.password || process.env.CLOUDANT_PASSWORD,
      database: config?.database || process.env.CLOUDANT_DATABASE || 'firn'
    }

    // Validate required configuration
    if (!finalConfig.url) {
      throw new Error('CLOUDANT_URL or COUCHDB_URL is required but not provided')
    }

    this.client = createCloudantClient(finalConfig)
    this.database = finalConfig.database
  }

  // Create a new instance with a different database
  withDatabase(databaseName: string): CouchDBConnector {
    return new CouchDBConnector({
      url: process.env.CLOUDANT_URL || process.env.COUCHDB_URL || 'http://localhost:5984',
      username: process.env.CLOUDANT_USERNAME,
      password: process.env.CLOUDANT_PASSWORD,
      database: databaseName
    })
  }

  // Create a document
  async createDocument<T extends Omit<BaseDocument, '_id'>>(document: T): Promise<{ id: string, rev: string }> {
    try {
      const response = await this.client.postDocument({
        db: this.database,
        document: document
      })
      return {
        id: response.result.id!,
        rev: response.result.rev!
      }
    }
    catch (error) {
      console.error('Error creating document:', error)
      throw error
    }
  }

  // Get a document by ID
  async getDocument<T extends CloudantV1.Document>(id: string): Promise<T | null> {
    try {
      const response = await this.client.getDocument({
        db: this.database,
        docId: id
      })
      return response.result as T
    }
    catch (error: any) {
      if (error.code === 404) {
        return null
      }
      console.error('Error getting document:', error)
      throw error
    }
  }

  // Update a document
  async updateDocument<T extends CloudantV1.Document>(id: string, document: T, rev: string): Promise<{ id: string, rev: string }> {
    try {
      const response = await this.client.putDocument({
        db: this.database,
        docId: id,
        document: { ...document, _rev: rev }
      })
      return {
        id: response.result.id!,
        rev: response.result.rev!
      }
    }
    catch (error) {
      console.error('Error updating document:', error)
      throw error
    }
  }

  // Delete a document
  async deleteDocument(id: string, rev: string): Promise<void> {
    try {
      await this.client.deleteDocument({
        db: this.database,
        docId: id,
        rev: rev
      })
    }
    catch (error) {
      console.error('Error deleting document:', error)
      throw error
    }
  }

  // Query documents using Mango queries
  async queryDocuments<T extends CloudantV1.Document>(selector: any, fields?: string[]): Promise<T[]> {
    try {
      const response = await this.client.postFind({
        db: this.database,
        selector,
        fields
      })
      return response.result.docs as T[]
    }
    catch (error) {
      console.error('Error querying documents:', error)
      throw error
    }
  }

  // Get all documents
  async getAllDocuments<T extends CloudantV1.Document>(): Promise<T[]> {
    try {
      const response = await this.client.postAllDocs({
        db: this.database,
        includeDocs: true
      })
      return response.result.rows.map(row => row.doc as T)
    }
    catch (error) {
      console.error('Error getting all documents:', error)
      throw error
    }
  }

  // Create database if it doesn't exist
  async ensureDatabase(): Promise<void> {
    try {
      const response = await this.client.putDatabase({
        db: this.database
      })
      if (response.result.ok) {
        console.log(`"${this.database}" database created.`)
      }
    }
    catch (error: any) {
      if (error.code === 412) {
        console.log(`Cannot create "${this.database}" database, it already exists.`)
      }
      else {
        console.error('Error creating database:', error)
        throw error
      }
    }
  }

  // Create indexes for better query performance
  async createIndex(fields: string[]): Promise<void> {
    try {
      await this.client.postIndex({
        db: this.database,
        index: {
          fields: fields.map(field => ({ [field]: 'asc' }))
        }
      })
    }
    catch (error) {
      console.error('Error creating index:', error)
      throw error
    }
  }
}

// Export a singleton instance with default configuration
export const couchDB = new CouchDBConnector()

// Helper function to ensure database exists
export async function ensureDatabase() {
  await couchDB.ensureDatabase()
}

// Export types for use in other modules
export type { BaseDocument }
