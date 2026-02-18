import { z } from 'zod'

// Some basic schemas that are used in other schemas of Firn-related types

// Optional string, number, or date string with undefined setting
// This is used to set a value to undefined if it is an empty string, number, or date string
export const DateStringOrUndefined = z.string().optional().transform(s => (s?.trim() === '' ? undefined : s))
export const NumberOrUndefined = z.union([z.number(), z.string().transform(Number)]).optional().transform(n => (n == null ? undefined : n))
export const StringOrUndefined = z.string().optional().transform(s => (s?.trim() === '' ? undefined : s))
