/**
 * Generate a prefixed, timestamped CouchDB document ID.
 *
 * Format: `<prefix>-<base36 timestamp>-<10 random alphanumeric chars>`
 *
 * The prefix is sanitised to lowercase alphanumeric + hyphens.
 * The timestamp gives rough chronological ordering and the random
 * suffix avoids collisions even at high insert rates.
 *
 * @example generateCouchDocId('user')  // "user-m42x1c3f-a7k2p0qw9x"
 * @example generateCouchDocId('room')  // "room-m42x1c3g-b3m8n1rv4z"
 */
export function generateCouchDocId(prefix: string): string {
  const safePrefix = prefix.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'doc'
  const timestamp = Date.now().toString(36)
  const random = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 10)
  return `${safePrefix}-${timestamp}-${random}`
}
