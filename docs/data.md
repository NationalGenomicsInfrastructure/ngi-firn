# Data handling

## Data storage

This application uses **CouchDB** as the document database, connected via the **IBM Cloudant** library. CouchDB is a NoSQL document database that stores data in JSON format, making it flexible for storing complex data structures.

Please find the detail information on the database [in the separate document](./couchDatabase.md).

## Data fetching

For data transmission between the `server` and the client `app`, traditional [REST](./api.md) and [tRPC](./trpc.md) are available. The latter is preferred for type-safety.

## Optimistic updates

When building user interfaces, fast reactivity is an easily overlooked, but relevant factor for good user experience. As a rule of thumb, [actions that are completed in 100ms](https://medium.com/shakuro/milliseconds-matter-how-time-builds-ux-6cac50fb472e) or less are perceived instantaneous by human users. For that reason, you will want to give a user the impression that something has happened, even if the server takes longer to handle the request.

In an _optimistic update_, the user interface behaves as though a change was successfully completed before receiving confirmation from the server that it actually was - it is being optimistic that it will eventually get the confirmation rather than an error. This allows for a more responsive user experience.

When you optimistically update the state in your client before performing a mutation, there is, however, a chance that the mutation will fail. In most of these failure cases, you can just trigger a refetch for your optimistic queries to revert them to their true server state. In some circumstances though, refetching may not work correctly and the mutation error could represent some type of server issue that won't make it possible to refetch. In this event, you can instead choose to rollback the client's state update.

For a single component, this is relatively straightforward using variables and updating the UI directly. However, if you have multiple places on the screen that would require to know about the update, manipulating the store directly will take care of these rollbacks for you automatically. That is exactly cache invalidation with [Pinia Colada](https://pinia-colada.esm.dev) is simplifying.

### Optimistic updates with Pinia Colada

In Firn, we use Pinia Colada as data fetching layer. The following example makes use of its [Reuseable Query](https://pinia-colada.esm.dev/advanced/reusable-queries.html) and [DynamicKey](https://pinia-colada.esm.dev/guide/query-keys.html#Dynamic-keys-with-variables) features.

Updating the cache directly is the most efficient way to implement optimistic updates because you are collocating the optimistic update with the mutation itself. Since you are touching the cache directly, any query relying on the updated data will automatically reflect the changes. However, this also requires handling the **rollback** in case of errors.

The basic template for a mutation looks like this:

```ts twoslash
import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DeleteUserByAdminInput } from '~~/schemas/users'

export const deleteUserByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
  mutation: (input: DeleteUserByAdminInput) => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.deleteUserByAdmin.mutate(input)
  },
  onMutate(input) {
    const queryCache = useQueryCache()
    return(context)
  },
  onSettled(_, input, context) {
    const queryCache = useQueryCache()
  },
  onError(error, input, context) {
    const queryCache = useQueryCache()
  },
  onSuccess(_, input, context) {
    const queryCache = useQueryCache()
  },
})
return { deleteUser: mutate, ...mutation }
})
```

To be able to reuse a mutation, we typically do not define them with `useMutation()` directly on the component and explicitly call it with `mutate` or `mutateAsync`, but wrap it in a separate utility function with `defineMutation()`. You can find all mutations in `app/utils/mutations`, split across multiple files according to functionality.

The mutation itself is a call to a REST / GraphQL endpoint or a tRPC procedure. Each mutation lifecycle consists of four main callbacks:

- `onMutate`: This is called immediately before the mutation function is executed. It is the ideal place to perform optimistic updates—such as updating the cache or UI to reflect the expected result—before the server responds. You can also return a context object here, which will be passed to the later callbacks for potential rollback.

- `onError`: This is triggered if the mutation fails (for example, due to a network or server error). It receives the error, the mutation input, and the context returned from `onMutate`. Here, you should use the context to rollback any optimistic updates and restore the previous state.

- `onSuccess`: This is called when the mutation completes successfully. You can use this to show success notifications or perform any side effects that should only happen after a confirmed update.

- `onSettled`: This is always called after the mutation finishes, regardless of whether it succeeded or failed. It is typically used to invalidate or refetch queries so that the UI stays in sync with the server state.

By leveraging these lifecycle hooks, you can provide a responsive and robust user experience, handling both optimistic UI updates and error recovery gracefully.

> :warning: Because `useQueryCache()` requires that the pinia instance is already injected into the app, it can only be used inside the callbacks, but not outside. Therefore, the `const queryCache = useQueryCache()` has to be declared separately for each callback, if it needs to be accessed.
