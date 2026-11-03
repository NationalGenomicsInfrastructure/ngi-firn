/*
 * Unit tests for the client-side table global-filter helpers. These are pure functions
 * with no CouchDB dependency; they live here only because this is the configured Vitest
 * include path. The matcher must be case-insensitive and require every query word to
 * appear somewhere in a row's searchable text.
 */
import { describe, it, expect } from 'vitest'
import type { Row } from '@tanstack/vue-table'
import { createGlobalFilter, searchWords, toSearchText } from '~/utils/table/globalFilter'

function asRow<T extends object>(original: T): Row<T> {
  return { original } as Row<T>
}

describe('searchWords', () => {
  it('splits on whitespace, trims and lowercases', () => {
    expect(searchWords('  Freezer  P12345 ')).toEqual(['freezer', 'p12345'])
  })

  it('returns an empty array for blank or non-string input', () => {
    expect(searchWords('   ')).toEqual([])
    expect(searchWords(undefined)).toEqual([])
    expect(searchWords(42)).toEqual([])
  })
})

describe('toSearchText', () => {
  it('flattens nested arrays, drops nullish/empty values and lowercases', () => {
    expect(toSearchText('Freezer', null, '', ['P12345', ['Sweden']], 0, false))
      .toBe('freezer p12345 sweden 0 false')
  })
})

describe('createGlobalFilter', () => {
  interface SampleRow { name: string, project: string }
  const filter = createGlobalFilter<SampleRow>(row => toSearchText(row.name, row.project))
  const row = asRow<SampleRow>({ name: 'Minus 80 Freezer', project: 'P12345' })

  it('matches when every word is found, across different fields', () => {
    expect(filter(row, 'name', 'freezer p12345')).toBe(true)
  })

  it('is case-insensitive and matches substrings', () => {
    expect(filter(row, 'name', 'FREEZ')).toBe(true)
  })

  it('fails when any single word is absent', () => {
    expect(filter(row, 'name', 'freezer p99999')).toBe(false)
  })

  it('treats an empty or whitespace query as a match (no filtering)', () => {
    expect(filter(row, 'name', '')).toBe(true)
    expect(filter(row, 'name', '   ')).toBe(true)
  })
})
