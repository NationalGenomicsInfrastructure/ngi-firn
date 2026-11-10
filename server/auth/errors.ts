/*
 * Generic authorization errors shared by every resource policy in server/auth.
 *
 * Kept deliberately resource-agnostic so the same two outcomes — "you cannot see this at all" and
 * "you can see it but may not do this" — are modelled once and mapped to transport error codes in a
 * single place (the tRPC/REST boundary), rather than re-invented per domain. Domain-specific
 * validation/conflict/not-found errors stay in their own services.
 */

/* The requester may not read/access the resource at all. */
export class AuthorizationError extends Error {
  constructor(message = 'You do not have access to this resource.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/* The requester is authenticated and may read the resource, but may not perform this action. */
export class ForbiddenError extends Error {
  constructor(message = 'You are not allowed to perform this action.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
