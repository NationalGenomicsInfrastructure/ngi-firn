# tRPC

> 😮‍💨 If you prefer, we can also expose selected [REST APIs](./api.md) for client-server communication.

## A primer on tRPC

[tRPC](https://trpc.io) (TypeScript Remote Procedure Call) is a modern API framework that enables end-to-end typesafe APIs in TypeScript applications.

Unlike REST, which uses HTTP methods and URLs to define endpoints that exchange JSON data, tRPC allows you to call server functions directly from your client code as if they were local functions. This circumvents the hassle of deserializing and serializing your objects for transmission in JSON and eliminates the need to validate request/response schemas or manually document the API.

tRPC automatically handles serialization and provides compile-time type checking. Because you get full TypeScript inference and autocompletion across your client-server boundary, client and API never go out of sync.

TypeScript will catch any mismatches between client and server types during development rather than at runtime, such that using tRPC does not require separate tests. This results in a more maintainable and less error-prone development experience compared to building REST APIs.

[More in the tRPC documentation](https://trpc.io/docs#an-alternative-to-traditional-rest-or-graphql)

## tRPC Nuxt

tRPC is most popular in the React ecosystem, but is [framework agnostic](https://trpc.io/docs/community/awesome-trpc#frontend-frameworks), so works with Svelte or Nuxt. We are using the [tRPC Nuxt module](https://github.com/wobsoriano/trpc-nuxt) in Firn.

## Authentication with tRPC context

The context in tRPC is a shared object that gets created for each incoming request and is available to all your tRPC procedures (queries and mutations). Think of it as a "request-scoped container" that holds information that's relevant for that specific request.

### Why do we need context?

In web applications, each request often needs access to:

- User authentication (who is making the request?)
- Request metadata (headers, cookies, etc.)
- Database connections (if you want to share connections)
- Request-specific data (timestamps, request IDs, etc.)

Without context, you'd have to pass this information to every single procedure manually, which would be tedious and error-prone.

### How context works

Here's the flow:

1. Request comes in → tRPC calls your createTRPCContext function
2. Context is created → Your function builds the context object
3. Context is passed to procedures → Every procedure can access ctx
4. Request ends → Context is discarded.

### Real-World Analogy

Think of context like a backpack that gets handed to each procedure:

- You pack the backpack once (in createTRPCContext)
- Every procedure can look inside the backpack (access ctx)
- Some procedures might add things to the backpack (middleware)
- The backpack gets thrown away after the request is done

This way, you don't have to carry the same information around manually - it's always there when you need it!

## Data fetching via tRPC

In Firn, we mostly use requests [via tRPC](https://trpc-nuxt.pages.dev/) and use [Pinia stores for state management](https://vueschool.io/lessons/introduction-to-pinia?friend=vuerouter&utm_source=pinia). The latter are abstracted away by [Pinia Colada](https://pinia-colada.esm.dev/), a whole data fetching layer around Pinia. Since Pinia Colada ships with its own composables, you will not interact with Pinia itself.

### Caveats

There are two caveats when combining the two. Both tRPC and Pinia Colada have a `useQuery()` composable. This means explicit imports by a different name are required:

```ts
import { useQuery as useQueryColada } from '@pinia/colada'
```

Furthermore, the result of a query must be serializable, which is not the case for tRPC procedures. Therefore adapting the following REST example from the Pinia Colada documentation

```ts
const {
  state,
  asyncStatus,
} = useQueryColada({
  key: ['todos'],
  query: () => fetch('/api/todos').then((res) => res.json()),
})
```

using a tRPC procedure instead

```ts
const {
  state,
  asyncStatus,
} = useQueryColada({
  key: ['todos'],
  query: () => $trpc.users.getToDos.useQuery().then((res) => res.data),
})
```

will only work once on mounting the component. But a refetch, for example triggered by a page reload, would result in a serialization error:

```console
 ERROR  [request error] [unhandled] [GET] http://localhost:3000/administration

ℹ Error: Cannot stringify a function

[CAUSE]
DevalueError {
  stack: 'Cannot stringify a function\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:48:10)\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:200:43)\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:108:15)\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:108:15)\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:108:15)\n' +
  'at flatten (./node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js:200:43)\n', 
  ... 808 more characters,
  message: 'Cannot stringify a function',
  name: 'DevalueError',
  path: '.pinia_colada[0][1][0].refresh',
}
```

### Combining tRPC with Pinia Colada

In order to combine the two, the actual query function wrapped by Pinia Colada's `useQuery` is moved into a separate function.

#### In components

In components, you can use the `useQuery()` hook from tRPC and also the `useNuxtApp()` context. Therefore:

```ts
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'

const { $trpc } = useNuxtApp()

const getApprovedFirnUsers = async () => {
  const res = await $trpc.users.getApprovedUsers.useQuery()
  return res.data
}

const {
  state,
  asyncStatus,
} = useQueryColada<DisplayUserToAdmin[]>({
  key: ['approvedFirnUsers'],
  query: getApprovedFirnUsers,
})

```

### In a separate utility function

Outside a component, like for example in `app/utils/users/apiUsers.ts`, we cannot make use of hooks

```ts
export const getApprovedFirnUsers = async (): Promise<DisplayUserToAdmin[]> => {
   const { $trpc } = useNuxtApp()
  const res = await $trpc.users.getApprovedUsers.query()
  return res
}
```

and must replace `useQuery()` with `query()`.
