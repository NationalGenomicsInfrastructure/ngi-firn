import { CloudantV1 } from '@ibm-cloud/cloudant'
import 'dotenv/config'

// CouchDB connection configuration
interface CouchDBConfig {
  url: string
  username?: string
  password?: string
  database: string
  enableGzipCompression?: boolean
}

// Base document interface extending CloudantV1.Document
interface BaseDocument extends CloudantV1.Document {
  _id: string
  _rev: string
}

// Parse CLOUDANT_COMPRESSION environment variable
function parseCompressionEnv(): boolean | undefined {
  const envValue = process.env.CLOUDANT_COMPRESSION
  if (envValue === undefined) return undefined
  return envValue.toLowerCase() === 'true' || envValue === '1'
}

// Initialize Cloudant client
function createCloudantClient(config: CouchDBConfig): CloudantV1 {
  console.log('Creating Cloudant client with config:', {
    url: config.url,
    username: config.username ? '****** (set)' : '- (not set)',
    password: config.password ? '****** (set)' : '- (not set)',
    database: config.database,
    enableGzipCompression: config.enableGzipCompression ?? false
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

  // Set gzip compression based on config (defaults to false if not specified)
  client.setEnableGzipCompression(config.enableGzipCompression ?? false)
  return client
}

// Database operations
export class CouchDBConnector {
  private client: CloudantV1
  private database: string

  constructor(config?: Partial<CouchDBConfig>) {
    // Merge config with environment variables
    const finalConfig: CouchDBConfig = {
      url: config?.url || process.env.CLOUDANT_URL || process.env.COUCHDB_URL || 'http://localhost:5984',
      username: config?.username || process.env.CLOUDANT_USERNAME,
      password: config?.password || process.env.CLOUDANT_PASSWORD,
      database: config?.database || process.env.CLOUDANT_DATABASE || 'firn',
      enableGzipCompression: config?.enableGzipCompression ?? parseCompressionEnv()
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
      database: databaseName,
      enableGzipCompression: parseCompressionEnv()
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
    catch (error: unknown) {
      const err = error as { code?: number, message?: string }
      if (err.code === 404) {
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
  async queryDocuments<T extends CloudantV1.Document>(selector: Record<string, unknown>, fields?: string[]): Promise<T[]> {
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

  /**
   * Query documents with pagination (limit + bookmark).
   * Use this for large datasets instead of queryDocuments to avoid loading all results.
   * Cloudant Find default limit is 25, max 200 per request.
   */
  async queryDocumentsPaginated<T extends CloudantV1.Document>(
    selector: Record<string, unknown>,
    options?: { limit?: number, bookmark?: string, fields?: string[] }
  ): Promise<{ docs: T[], bookmark?: string }> {
    try {
      const limit = Math.min(options?.limit ?? 200, 200)
      const response = await this.client.postFind({
        db: this.database,
        selector,
        limit,
        bookmark: options?.bookmark,
        fields: options?.fields
      })
      const result = response.result
      return {
        docs: result.docs as T[],
        bookmark: result.bookmark ?? undefined
      }
    }
    catch (error) {
      console.error('Error querying documents (paginated):', error)
      throw error
    }
  }

  /**
   * Get database information. Returns null if the database does not exist (404).
   * Useful for optional external databases (e.g. projects) that may not be present.
   */
  async getDatabaseInformation(): Promise<CloudantV1.DatabaseInformation | null> {
    try {
      const response = await this.client.getDatabaseInformation({
        db: this.database
      })
      return response.result
    }
    catch (error: unknown) {
      const err = error as { code?: number }
      if (err.code === 404) {
        return null
      }
      console.error('Error getting database information:', error)
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
    catch (error: unknown) {
      const err = error as { code?: number, message?: string }
      if (err.code === 412) {
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

  // Test database connectivity
  async testConnection(): Promise<boolean> {
    try {
      // Try to get database info - this will fail if the database server is not reachable
      await this.client.getDatabaseInformation({
        db: this.database
      })
      return true
    }
    catch (error: unknown) {
      const err = error as { code?: number | string, message?: string }
      // Check for specific connection errors
      if (this.isConnectionError(err)) {
        console.error('❌ Database connection failed:', err.message)
        console.error('   This indicates the database server is not available.')
        console.error('   Please ensure CouchDB is running and accessible.')
        return false
      }

      // If it's a 404, the database doesn't exist but the server is reachable
      if (err.code === 404) {
        console.log(`Database "${this.database}" does not exist, but server is reachable.`)
        return true
      }

      // For other errors, log but don't treat as connection failure
      console.error('Database test failed with error:', err.message)
      return false
    }
  }

  // Check if an error is a connection error
  private isConnectionError(error: { code?: number | string, message?: string }): boolean {
    const errorMessage = error.message?.toLowerCase() || ''
    const errorCode = error.code?.toString().toLowerCase() || ''

    // Common connection error patterns
    const connectionErrorPatterns = [
      'econnrefused',
      'connection refused',
      'connect econnrefused',
      'network error',
      'timeout',
      'enotfound',
      'getaddrinfo enotfound',
      'unable to connect',
      'connection failed',
      'connection timeout'
    ]

    return connectionErrorPatterns.some(pattern =>
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    )
  }

  // Validate database connection and terminate if not available
  async validateConnection(): Promise<void> {
    console.log('🛋  Validating database connection...')

    const isConnected = await this.testConnection()

    if (!isConnected) {
      console.error('❌ Database connection validation failed!')
      console.error('   The application cannot start without a database connection.')
      console.error('   Please check your database configuration and ensure CouchDB is running.')
      console.error('   Environment variables:')
      console.error(`   - CLOUDANT_URL: ${process.env.CLOUDANT_URL || '- (not set)'}`)
      console.error(`   - CLOUDANT_USERNAME: ${process.env.CLOUDANT_USERNAME ? '****** (set)' : '- (not set)'}`)
      console.error(`   - CLOUDANT_PASSWORD: ${process.env.CLOUDANT_PASSWORD ? '****** (set)' : '- (not set)'}`)
      console.error(`   - CLOUDANT_DATABASE: ${process.env.CLOUDANT_DATABASE || 'firn (default)'}`)
    }
    else {
      console.log('✅ Database connection validated successfully')
    }
  }
}

// Export a singleton instance with default configuration
export const couchDB = new CouchDBConnector()

// Helper function to ensure database exists
export async function ensureDatabase() {
  await couchDB.ensureDatabase()
}

// Helper function to validate database connection
export async function validateDatabaseConnection() {
  await couchDB.validateConnection()
}

// Export types for use in other modules
export type { BaseDocument }
