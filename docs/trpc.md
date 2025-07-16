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