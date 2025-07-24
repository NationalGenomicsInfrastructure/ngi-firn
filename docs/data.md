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

Here is a **complete example** of an optimistic update for the details of a contact:

```ts twoslash
import { useMutation, useQueryCache } from '@pinia/colada'
import { patchContact } from [...]
import type { Contact } from [...]

const queryCache = useQueryCache()
const { mutate } = useMutation({
  mutation: patchContact,
  // `contactInfo` type is inferred from the mutation function
  onMutate(contactInfo) {
    // get the current contact from the cache, we assume it exists
    const oldContact = queryCache.getQueryData<Contact>(['contact', contactInfo.id])!
    const newContact: Contact = {
      // we merge both objects to have a complete contact
      ...oldContact,
      ...contactInfo,
    }

    // update the cache with the new contact
    queryCache.setQueryData(['contact', newContact.id], newContact)
    // we cancel (without refetching) all queries that depend on the contact
    queryCache.cancelQueries({ key: ['contact', newContact.id] })

    // pass the old and new contact to the other hooks
    return { oldContact, newContact }
  },

  // on both error and success
  onSettled(_data, _error, _vars, { newContact }) {
    // `newContact` can be undefined if the `onMutate` hook fails
    if (newContact) {
      // invalidate the query to refetch the new data
      queryCache.invalidateQueries({ key: ['contact', newContact.id] })
    }
  },

  onError(err, contactInfo, { newContact, oldContact }) {
    // before applying the rollback, we need to check if the value in the cache
    // is the same because the cache could have been updated by another mutation
    // or query
    if (newContact === queryCache.getQueryData(['contact', contactInfo.id])) {
      queryCache.setQueryData(['contact', contactInfo.id], oldContact)
    }

    // handle the error
    console.error(`An error occurred when updating a contact "${contactInfo.id}"`, err)
  },

  // Depending on your code, this `onSuccess` hook might not be necessary
  onSuccess(contact, _contactInfo, { newContact }) {
    // update the contact with the information from the server
    // since we are invalidating queries, this allows us to progressively update
    queryCache.setQueryData(['contact', newContact.id], contact)
  },
})
```
