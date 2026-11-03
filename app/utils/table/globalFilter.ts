/*
 * Shared helpers for client-side global table filtering.
 *
 * These back the search inputs added above the inventory/admin tables. Filtering is
 * purely local: it narrows the rows already loaded into a table, it never triggers a
 * server query. Matching is case-insensitive and word-wise — the trimmed query is split
 * into words and a row matches only when every word appears somewhere in that row's
 * explicit searchable text (so "freezer P12345" can match a name and a linked project ID
 * in the same row).
 *
 * Each table passes an explicit projection of the fields that should be searchable rather
 * than serializing the whole row, so sensitive or irrelevant fields (encrypted tokens,
 * internal identifiers, avatar URLs) are never matched.
 */
import type { Row } from '@tanstack/vue-table'

/*
 * Flatten arbitrary values into a single lowercase string. Nullish and empty values are
 * dropped; arrays (including nested ones) are flattened so callers can pass lists of
 * project refs, flag comments, etc. directly.
 */
export function toSearchText(...values: unknown[]): string {
  return values
    .flat(Infinity as 1)
    .filter((value): value is NonNullable<unknown> => value != null && value !== '')
    .map(value => String(value))
    .join(' ')
    .toLowerCase()
}

/* Split a raw query into trimmed, lowercased, non-empty words. */
export function searchWords(query: unknown): string[] {
  if (typeof query !== 'string') return []
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/*
 * Build a TanStack `globalFilterFn` that matches a row when every query word appears in
 * the text produced by `getText(row.original)`. The column id is ignored on purpose:
 * matching is row-wide across the explicit projection, not per column. TanStack invokes
 * the global filter once per filterable column, so the per-row text is memoized to avoid
 * recomputing the projection for every column of every row.
 */
export function createGlobalFilter<T extends object>(getText: (row: T) => string) {
  const cache = new WeakMap<T, string>()
  return (row: Row<T>, _columnId: string, filterValue: unknown): boolean => {
    const words = searchWords(filterValue)
    if (words.length === 0) return true
    let haystack = cache.get(row.original)
    if (haystack === undefined) {
      haystack = getText(row.original)
      cache.set(row.original, haystack)
    }
    return words.every(word => haystack!.includes(word))
  }
}
