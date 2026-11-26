import { TRPCClientError } from '@trpc/client'
import { ZodError } from 'zod'
import type { NuxtError } from '#app'

export function isNuxtZodError(err: unknown): err is NuxtError<{ data: ZodError }> {
  return (
    isNuxtError(err)
    && (err.data as { data?: unknown })?.data instanceof ZodError
  )
}

/* True when a tRPC call failed with the given code, e.g. 'NOT_FOUND' or 'CONFLICT'. */
export function hasTrpcErrorCode(error: unknown, code: string): boolean {
  return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === code
}
