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