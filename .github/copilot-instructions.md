# Copilot Instructions for NGI Firn

NGI Firn is a **Nuxt 4** laboratory freezer inventory management system for the National Genomics Infrastructure of Sweden. It uses Vue 3, TypeScript, CouchDB, tRPC, and UnaUI.

## Commands

```bash
pnpm dev           # Start dev server (http://localhost:3000)
pnpm build         # Production build
pnpm typecheck     # TypeScript type-check (not run during dev, only at build)
pnpm lint          # ESLint
pnpm db:test       # Verify CouchDB connection
pnpm db:init       # Create first admin user (set FIRST_ADMIN_EMAIL first)
```

There is no automated test suite. `pnpm` is enforced as the package manager (a `preinstall` script blocks npm/yarn). Node ≥ 24 is required.

## Architecture

### Nuxt 4 Directory Layout

This project uses the **Nuxt 4 compatibility layout** (`future: { compatibilityVersion: 4 }`), which means files live under three top-level source directories — not in the project root as in Nuxt 3:

| Directory | Purpose |
|-----------|---------|
| `app/` | Client-side: pages, components, composables, layouts, middleware, plugins, utils |
| `server/` | Server-side: tRPC routers, REST API handlers, CouchDB CRUD, auth, security |
| `shared/` | Code shared across both sides |
| `types/` | TypeScript interface definitions for all document types |
| `schemas/` | Zod schemas for request validation |

**Nuxt auto-imports** everything in these directories — Vue APIs, composables, components, and server utilities are available without explicit `import` statements.

### Data Flow

```
Client (Vue component / page)
  ↓  useNuxtApp().$trpc.<router>.<procedure>.query() / .mutate()
tRPC router  (server/trpc/routers/)
  ↓  Service classes
CouchDB  (server/database/couchdb.ts → CouchDBConnector)
```

**tRPC is preferred** for all client-server communication. REST API routes (`server/api/`) exist only for OAuth callbacks and a few special cases.

### tRPC Procedures

Defined in `server/trpc/init.ts`. Use the appropriate procedure type:

| Export | When to use |
|--------|-------------|
| `baseProcedure` | Public, no auth required |
| `authedProcedure` | Logged-in user with `allowLogin` and not retired |
| `adminProcedure` | Admin only (`ctx.secure.isAdmin`) |
| `firnUserProcedure` | Needs full `FirnUser` object from DB in context |
| `tokenProcedure` | Allows token-based auth (lab tablets) |

The tRPC context (`server/trpc/init.ts`) populates `ctx.user`, `ctx.secure`, and `ctx.firnUser` from either session cookies or the `Authorization` header token.

### State Management & Data Fetching

Firn uses **Pinia Colada** (`@pinia/colada`) as the data-fetching layer on top of tRPC. Think of it as a cache that sits between your Vue components and the server: components read from the cache, and mutations update both the server and the cache. This means that when one component changes data, every other component that reads the same data automatically sees the update — no manual event passing required.

#### The query key system

Every cached dataset is identified by an **array key**. Keys are defined as factory objects in `app/utils/queries/` and must be used consistently across queries and mutations so cache operations target the right data:

```ts
// app/utils/queries/users.ts
export const USERS_QUERY_KEYS = {
  root: ['users'] as const,
  approved: () => [...USERS_QUERY_KEYS.root, 'approved'] as const,
  pending:  () => [...USERS_QUERY_KEYS.root, 'pending']  as const,
  retired:  () => [...USERS_QUERY_KEYS.root, 'retired']  as const,
  self:     () => [...USERS_QUERY_KEYS.root, 'self']     as const,
} as const
```

The array structure lets Pinia Colada invalidate whole sub-trees: invalidating `['users']` invalidates approved, pending, retired, and self all at once.

> **Why not derive keys from tRPC?** `getQueryKey()` from `trpc-nuxt/client` returns a string, but Pinia Colada requires an array. Hardcoded key factories are the established pattern here.

#### Defining reusable queries

Use `defineQueryOptions` in `app/utils/queries/` to declare queries that can be referenced by both components and mutations:

```ts
// app/utils/queries/users.ts
import { defineQueryOptions } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'

export const approvedUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.approved(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getApprovedUsers.query()   // note: .query(), not .useQuery()
  }
})
```

In a component, consume it with `useQuery` from Pinia Colada (aliased to avoid the naming clash with tRPC's own `useQuery`):

```ts
import { useQuery as useQueryColada } from '@pinia/colada'

const { state, asyncStatus } = useQueryColada(approvedUsersQuery)
// state.value.data is the cached array; asyncStatus.value is 'idle' | 'loading'
```

> **Naming collision**: Both `@pinia/colada` and `trpc-nuxt` export `useQuery`. Always import Pinia Colada's version under an alias. Missing this alias causes a silent bug where tRPC's hook is called instead, which will break on page reload with a `Cannot stringify a function` serialization error.

#### Defining reusable mutations

Put all mutations in `app/utils/mutations/`, wrapped in `defineMutation()`. This makes them reusable across components without re-creating the mutation state each time.

The mutation function itself calls the tRPC procedure. The four lifecycle callbacks handle the rest:

```ts
// app/utils/mutations/users.ts
import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'

export const deleteUserByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({

    // 1. THE ACTUAL SERVER CALL
    mutation: (input: DeleteUserByAdminInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.users.deleteUserByAdmin.mutate(input)
    },

    // 2. BEFORE the server responds — snapshot state for rollback, apply optimistic update
    onMutate(input) {
      const queryCache = useQueryCache()
      // Snapshot current cache so we can roll back if the server rejects the mutation
      const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved()) || []

      // Optimistically remove the user from the cache immediately (UI updates instantly)
      queryCache.cancelQueries({ key: USERS_QUERY_KEYS.approved(), exact: true }) // stop any in-flight fetch
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), approved.filter(u => u.googleId !== input.googleId))

      return { approved } // <-- this object becomes `context` in onError/onSuccess/onSettled
    },

    // 3. IF the server call fails — roll back using the snapshot from onMutate
    onError(error, input, context) {
      const queryCache = useQueryCache()
      // Restore the pre-mutation state from the context snapshot
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), context.approved ?? [])
      showError(error.message, `User could not be deleted.`)
    },

    // 4. IF the server call succeeds — good place for success notifications
    onSuccess(_data, input) {
      showSuccess(`User deleted successfully.`, `Deleted`)
    },

    // 5. ALWAYS runs after success or error — sync the cache with the real server state
    onSettled() {
      const queryCache = useQueryCache()
      // Mark cache as stale; next time this data is needed it will be re-fetched
      queryCache.invalidateQueries({ key: USERS_QUERY_KEYS.approved(), exact: true })
    },
  })
  return { deleteUser: mutate, ...mutation }
})
```

> **Critical constraint**: `useQueryCache()` requires the Pinia instance to already be injected, so it **must** be called inside each callback individually — not hoisted to the top of `defineMutation`. Declaring it outside the callbacks will throw a runtime error.

#### Using a mutation in a component

```ts
// In a .vue component <script setup>
const { deleteUser, isLoading } = deleteUserByAdmin()
// Call it directly — Pinia Colada runs the full lifecycle automatically
await deleteUser({ googleId: user.googleId, googleGivenName: user.googleGivenName, ... })
```

#### The optimistic update pattern in detail

The pattern used throughout the codebase for mutations that touch multiple cached lists:

1. **`onMutate`**: Read all relevant lists from the cache, save them as snapshots, then write the expected post-mutation state back immediately. Call `cancelQueries` before `setQueryData` to prevent an in-flight fetch from overwriting your optimistic write. Return all snapshots as the context object.

2. **`onError`**: Receive the context from `onMutate`. Write each snapshot back to restore the previous state. If the snapshot is missing (e.g. the cache was empty when the mutation started), write an empty array or `undefined` rather than leaving stale optimistic data.

3. **`onSettled`**: Invalidate every key that was touched, so the next access fetches fresh data from the server. This runs even if `onError` already rolled back — the refetch will just confirm the rollback.

4. **`onSuccess`**: Keep lightweight. The cache was already updated optimistically in `onMutate`, and `onSettled` will sync it afterward. Use `onSuccess` for notifications or writing returned server data to the cache when the server response contains the authoritative new state.

For mutations that move items between lists (e.g. promoting a pending user to approved), apply all list changes in `onMutate` before returning the snapshots. See `setUserAccessByAdmin` in `app/utils/mutations/users.ts` for the full cross-list pattern.

#### tRPC call convention by context

| Location | Pattern |
|----------|---------|
| Inside `defineMutation` / `defineQueryOptions` callback | `const { $trpc } = useNuxtApp()` then `.query()` / `.mutate()` |
| Inside a Vue component | Same as above |
| Outside a component (plain utility function) | Cannot use hooks — pass `$trpc` as a parameter or call from a composable context |

### Database (CouchDB)

CouchDB documents must include:

- `_id` / `_rev`: Managed by CouchDB
- `type`: Document type string (e.g. `'user'`, `'project'`)
- `schema`: Integer version — **must be incremented whenever the document shape changes**

Document TypeScript interfaces extend `BaseDocument` from `server/database/couchdb.ts` and live in `types/`. All DB operations go through `CouchDBConnector` (`couchDB`) in `server/database/couchdb.ts`, with domain-specific service classes (e.g. `UserService` in `server/crud/users.server.ts`) on top.

### Authentication

- **Google OAuth** is mandatory; users must have a `@scilifelab.se` email.
- **GitHub OAuth** is optional; links to the same Firn account.
- **Token auth** (`server/security/tokens.server.ts`) is for lab tablets and shared computers; tokens are user-issued and revocable.
- New users self-request access; an admin must approve them. `NUXT_SESSION_PASSWORD` (≥ 32 chars) seals session cookies and signs tokens — rotating it invalidates all sessions.

## Key Conventions

### Component Naming

Components are auto-imported by path. A component at `app/components/frontpage/Header.vue` is used as `<FrontpageHeader />`. The component's filename should match its full resolved name to avoid duplicate-name warnings.

Pages **must have a single root element** in `<template>` — multiple roots or a leading HTML comment will break client-side route transitions.

### UI Library (UnaUI)

All UnaUI components are prefixed with `N` (configured via `una: { prefix: 'N' }`): `NCard`, `NButton`, `NIcon`, `NInput`, `NSidebar`, etc. Icons use the `i-lucide-*` icon set (e.g. `i-lucide-user`, `i-lucide-calendar`).

**Read-only label/value display pattern** (cards, table expanded rows):

```vue
<div class="flex items-center gap-1.5 mb-0.5">
  <NIcon :name="field.icon" class="text-primary-400 dark:text-primary-600 text-xs" />
  <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
    {{ field.label }}
  </span>
</div>
<p class="font-medium pl-5">{{ field.value ?? '—' }}</p>
```

**Form label style** (define as a constant per component to avoid repetition):

```ts
const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'
```

Apply via `:una="{ formLabel: FORM_LABEL_STYLE }"` on `NFormField`. Use `text-primary-700 dark:text-primary-300` instead when the background is gray (`card="soft-gray"`).

**Table headers** share a single constant:

```ts
const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
```

Default card variant: `card="outline-gray"`. Badge variants for status: `solid-primary`, `solid-error`, `solid-success`, `solid-gray`, `solid-yellow`, `solid-indigo`.

### Custom Themes

When adding or renaming a custom color theme, update **all four** of these files consistently:
1. `app/config/theme.ts` — Define the palette and add name to `CUSTOM_PRIMARY_THEMES`
2. `uno.config.ts` — Add to `extendTheme` so UnoCSS utilities work
3. `app/composables/useFirnThemes.ts` — Add CSS var map and extend theme lists
4. `app/plugins/theme-custom.client.ts` — Apply CSS vars at runtime (missing this means the theme silently does nothing)

### REST API Routes (server/api/)

File name suffix determines the HTTP method: `hello.get.ts`, `hello.post.ts`, etc. Validate request bodies with Zod via `readValidatedBody(event, schema.parse)`. Schemas live in `schemas/`.

### ESLint Style

Single quotes, no trailing commas (configured in `nuxt.config.ts` eslint stylistic settings).

## Environment Setup

Copy `.env.example` to `.env`. Required variables:

```
NUXT_SESSION_PASSWORD=        # ≥ 32 chars, seals sessions and tokens
NUXT_SESSION_SALT=
NUXT_OAUTH_GOOGLE_CLIENT_ID=
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=
CLOUDANT_URL=                 # Default: http://localhost:5984
CLOUDANT_USERNAME=
CLOUDANT_PASSWORD=
CLOUDANT_DATABASE=            # Default: firn
```

For local HTTPS development, set `LOCALHOST_HTTPS_KEY` and `LOCALHOST_HTTPS_CERT` and use `pnpm dev-https`. See `docs/development-https.md`.
