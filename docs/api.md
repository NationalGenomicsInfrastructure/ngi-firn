# APIs and server-side code

> :warning: Mind that Noetic uses predominantly [tRPC](./trpc.md) for client-server communication.

## REST API Routes

The API routes follow a similar convention as the `app/pages/` directory in Nuxt. All you have to do is to create a file in the `server/api/` directory, for example `server/api/hello.ts`:

```js
export default defineEventHandler((event) => {
  return { hello: 'world' }
})
```

`defineEventHandler` comes from [unjs/h3](https://unjs.io/packages/h3), the HTTP framework used by Nuxt and is auto-imported. When running your Nuxt development server with `nuxt dev`, you can call the API route by opening [http://localhost:3000/api/hello](http://localhost:3000/api/hello) in your browser.

To match a specific HTTP Method, you can suffix the filename with `.get`, `.post`, `.put`, `.delete`, etc:

```js
// server/api/hello.post.ts
export default defineEventHandler(() => 'Only POST handler')
```

```js
// server/api/hello.get.ts
export default defineEventHandler(() => 'Only GET handler')
```

More information can be found in the  Nuxt documentation on [server route features](https://nuxt.com/docs/guide/directory-structure/server#recipes).

### Developer experience

A Postman-like UI to call your API routes is available in the Nuxt DevTools by clicking the Server Routes tab. Alternatively enter `nuxt-devtools-api-routes` in the CLI.

## REST API Route Validation

The v1.8 release of [H3](https://unjs.io/packages/h3) added methods to validate the `params`/`query`/`body` of an incoming request. This ensures correct values are used in the handlers, for which we are using the popular [zod](https://zod.dev/) library.

Assume we wish to validate the body of an `/api/login` handler:

```js
//server/api/login.post.ts
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12)
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  return { body: 'valid' }
})
```

If a request with an invalid email address or password is sent, the server will respond with a 400 status code automatically. Use `nuxt-devtools-api-route-400` to inspect the response.
