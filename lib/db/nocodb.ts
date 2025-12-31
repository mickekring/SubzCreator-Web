import { Api } from 'nocodb-sdk'

// Type alias for NocoDB API client (for type safety in API routes)
export type NocoDBApi = Api<unknown>

/**
 * Sanitize a string value for use in NocoDB where clauses
 * Prevents NoSQL injection by escaping special characters
 */
export function sanitizeNocoDBValue(value: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid value for NocoDB query');
  }
  // Escape NocoDB query operators: parentheses, commas, and tilde
  // These characters have special meaning in NocoDB filter syntax
  return value
    .replace(/[(),~]/g, '') // Remove query delimiters
    .replace(/\\/g, '') // Remove backslashes
    .trim();
}

/**
 * Validate and sanitize an email for NocoDB where clauses
 * Ensures the value is a valid email format before use
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email');
  }

  // Strict email regex - only allow valid email characters
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const trimmedEmail = email.trim().toLowerCase();

  if (!emailRegex.test(trimmedEmail)) {
    throw new Error('Invalid email format');
  }

  // Double-check: no NocoDB special characters should be in a valid email
  if (/[(),~]/.test(trimmedEmail)) {
    throw new Error('Invalid email format');
  }

  return trimmedEmail;
}

/**
 * Validate and sanitize a numeric ID for NocoDB where clauses
 * Ensures the value is a positive integer
 */
export function sanitizeNumericId(id: string | number): number {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;

  if (isNaN(numId) || numId < 0 || !Number.isInteger(numId)) {
    throw new Error('Invalid ID');
  }

  return numId;
}

/**
 * NocoDB Client Singleton
 * Provides a configured instance of the NocoDB API client
 */
class NocoDBClient {
  private static instance: Api<any> | null = null
  private static baseId: string | null = null

  /**
   * Get or create NocoDB API instance
   */
  static getClient(): Api<any> {
    if (!this.instance) {
      const baseUrl = process.env.NOCODB_URL
      const apiToken = process.env.NOCODB_API_TOKEN

      if (!baseUrl || !apiToken) {
        throw new Error(
          'NocoDB configuration missing. Please set NOCODB_URL and NOCODB_API_TOKEN in .env'
        )
      }

      this.instance = new Api({
        baseURL: baseUrl,
        headers: {
          'xc-token': apiToken,
        },
      })
    }

    return this.instance
  }

  /**
   * Get base ID by name
   * Caches the result for subsequent calls
   */
  static async getBaseId(): Promise<string> {
    if (this.baseId) {
      return this.baseId
    }

    const baseName = process.env.NOCODB_BASE_NAME || 'SubzCreator'
    const client = this.getClient()

    try {
      // List all bases and find matching name
      const bases = await client.base.list()
      const base = bases.list?.find(
        (b: any) => b.title === baseName || b.name === baseName
      )

      if (!base) {
        throw new Error(
          `NocoDB base "${baseName}" not found. Please create the base first.`
        )
      }

      this.baseId = base.id!
      return base.id as string
    } catch (error) {
      console.error('Error fetching NocoDB base:', error)
      throw new Error(`Failed to fetch NocoDB base: ${error}`)
    }
  }

  /**
   * Get table ID by name
   */
  static async getTableId(tableName: string): Promise<string> {
    const client = this.getClient()
    const baseId = await this.getBaseId()

    try {
      const tables = await client.dbTable.list(baseId)
      const table = tables.list?.find(
        (t: any) => t.title === tableName || t.table_name === tableName
      )

      if (!table) {
        throw new Error(
          `Table "${tableName}" not found in base. Please create the table first.`
        )
      }

      return table.id as string
    } catch (error) {
      console.error(`Error fetching table "${tableName}":`, error)
      throw new Error(`Failed to fetch table: ${error}`)
    }
  }

  /**
   * Reset cached instances (useful for testing)
   */
  static reset() {
    this.instance = null
    this.baseId = null
  }
}

/**
 * NocoDB Table Operations
 * Provides CRUD operations for NocoDB tables with type safety
 */
export class NocoTable<T = any> {
  private tableName: string
  private tableId: string | null = null

  constructor(tableName: string) {
    this.tableName = tableName
  }

  /**
   * Get the table ID (cached)
   */
  private async getTableId(): Promise<string> {
    if (!this.tableId) {
      this.tableId = await NocoDBClient.getTableId(this.tableName)
    }
    return this.tableId
  }

  /**
   * List records with optional filtering and pagination
   */
  async list(options?: {
    where?: string
    limit?: number
    offset?: number
    sort?: string
  }): Promise<{ list: T[]; pageInfo: any }> {
    const client = NocoDBClient.getClient()
    const tableId = await this.getTableId()

    try {
      const response = await client.dbTableRow.list('noco', 'SubzCreator', tableId, {
        ...options,
      })
      return response as { list: T[]; pageInfo: any }
    } catch (error) {
      console.error(`Error listing records from ${this.tableName}:`, error)
      throw error
    }
  }

  /**
   * Get a single record by ID
   */
  async findById(id: string | number): Promise<T | null> {
    const client = NocoDBClient.getClient()
    const tableId = await this.getTableId()

    try {
      const record = await client.dbTableRow.read('noco', 'SubzCreator', tableId, id)
      return record as T
    } catch (error) {
      console.error(`Error finding record ${id} in ${this.tableName}:`, error)
      return null
    }
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    const client = NocoDBClient.getClient()
    const tableId = await this.getTableId()

    try {
      const record = await client.dbTableRow.create('noco', 'SubzCreator', tableId, data)
      return record as T
    } catch (error) {
      console.error(`Error creating record in ${this.tableName}:`, error)
      throw error
    }
  }

  /**
   * Update a record by ID
   */
  async update(id: string | number, data: Partial<T>): Promise<T> {
    const client = NocoDBClient.getClient()
    const tableId = await this.getTableId()

    try {
      const record = await client.dbTableRow.update(
        'noco',
        'SubzCreator',
        tableId,
        id,
        data
      )
      return record as T
    } catch (error) {
      console.error(`Error updating record ${id} in ${this.tableName}:`, error)
      throw error
    }
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string | number): Promise<boolean> {
    const client = NocoDBClient.getClient()
    const tableId = await this.getTableId()

    try {
      await client.dbTableRow.delete('noco', 'SubzCreator', tableId, id)
      return true
    } catch (error) {
      console.error(`Error deleting record ${id} from ${this.tableName}:`, error)
      return false
    }
  }

  /**
   * Count records with optional filtering
   */
  async count(where?: string): Promise<number> {
    const response = await this.list({ where, limit: 1 })
    return response.pageInfo?.totalRows || 0
  }
}

// Export the client for advanced usage
export const nocodb = NocoDBClient.getClient()
export const getNocoDBClient = () => NocoDBClient.getClient()
export default NocoDBClient
