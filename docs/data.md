# Data handling

## Data storage

This application uses **CouchDB** as the document database, connected via the **IBM Cloudant** library. CouchDB is a NoSQL document database that stores data in JSON format, making it flexible for storing complex data structures.

Please find the detail information on the database [in the separate document](./couchDatabase.md).

## Data fetching

For data transmission between the `server` and the client `app`, traditional [REST](./api.md) and [tRPC](./trpc.md) are available. The latter is preferred for type-safety.

### Optimistic updates

When building user interfaces, fast reactivity is an easily overlooked, but relevant factor for good user experience. As a rule of thumb, [actions that are completed in 100ms](https://medium.com/shakuro/milliseconds-matter-how-time-builds-ux-6cac50fb472e) or less are perceived instantaneous by human users. For that reason, you will want to give a user the impression that something has happened, even if the server takes longer to handle the request. 

In an _optimistic update_, the user interface behaves as though a change was successfully completed before receiving confirmation from the server that it actually was - it is being optimistic that it will eventually get the confirmation rather than an error. This allows for a more responsive user experience.

When you optimistically update the state in your client before performing a mutation, there is, however, a chance that the mutation will fail. In most of these failure cases, you can just trigger a refetch for your optimistic queries to revert them to their true server state. In some circumstances though, refetching may not work correctly and the mutation error could represent some type of server issue that won't make it possible to refetch. In this event, you can instead choose to rollback the client's state update.

For a single component, this is relatively straightforward using variables and updating the UI directly. However, if you have multiple places on the screen that would require to know about the update, manipulating the store directly will take care of these rollbacks for you automatically. That is exactly cache invalidation with [Pinia Colada](https://pinia-colada.esm.dev) is simplifying.
