# Data handling

## Data storage

> :warning: At the moment, the eventual data storage for this app is not decided yet. A [multi-model database with graph support like SurrealDB](https://surrealdb.com/docs/sdk/javascript/core/create-a-new-connection) is appealing,  but we started out with a conventional relational database.

### Relational database(s)

#### Primer

Relational databases organize data into structured tables with predefined schemas, where each table represents an entity and columns define its attributes. A single table entry always has a unique ID, which may be referenced in a column that belongs to a different entity/table. Depending on the type of relationship (_one to one, many to one, one to many or many to many_), this reference may be a simple _foreign key_ column or a separate linkage table. SQL (Structured Query Language) is typically used for data manipulation and retrieval.

To avoid using SQL directly, the database structure and models are mapped to objects of the backend language, in this case TypeScript, by an ORM.

#### Drizzle ORM

[Drizzle ORM](https://orm.drizzle.team) is a TypeScript Object-Relational Mapper (ORM) that provides type-safe database access. It acts as a bridge between the application code and database, allowing you to work with database records as if they were regular TypeScript objects, while handling the SQL generation and query execution. Drizzle is designed to be lightweight and performant while still providing full type safety.

For this project, you will find the relevant files:

- The database schema are defined in `server/database/schema.ts` and describe the database structure. They can be edited manually or using Drizzle's schema builder, which is integrated into the [Nuxt Developer tools](https://devtools.nuxt.com) or can be launched with `pnpm db:studio`.
- The database connection is configured in `server/utils/db.ts`.
- The main configuration file is  `drizzle.config.ts`.

#### Migrations

Database migrations are SQL files that describe changes to the database schema, like creating/modifying tables or adding constraints. They ensure that changes to a database are tracked and can be applied consistently across environments. For example, if you need to restore an older backup of the database that lacks the latest changes, the relevant migrations can be selectively applied.

To generate a new migration:

1. Make the required changes to the schema in `server/database/schema.ts`
2. Run `pnpm db:generate` to auto-create a new migration file in `server/database/migrations/`
3. The migration will be automatically applied when starting the `dev` server.

If you need to create a migration manually, because a change is required that can't be represented as a change in the schema, run `pnpm drizzle-kit generate --custom`.

## Data fetching

For data transmission between the `server` and the client `app`, traditional [REST](./api.md) and [tRPC](./trpc.md) are available. The latter is preferred.

### Optimistic updates

When building user interfaces, fast reactivity is an easily overlooked, but relevant factor for good user experience. As a rule of thumb, [actions that are completed in 100ms](https://medium.com/shakuro/milliseconds-matter-how-time-builds-ux-6cac50fb472e) or less are perceived instantaneous by human users. For that reason, you will want to give a user the impression that something has happened, even if the server takes longer to handle the request. 

In an _optimistic update_, the user interface behaves as though a change was successfully completed before receiving confirmation from the server that it actually was - it is being optimistic that it will eventually get the confirmation rather than an error. This allows for a more responsive user experience.

When you optimistically update the state in your client before performing a mutation, there is, however, a chance that the mutation will fail. In most of these failure cases, you can just trigger a refetch for your optimistic queries to revert them to their true server state. In some circumstances though, refetching may not work correctly and the mutation error could represent some type of server issue that won't make it possible to refetch. In this event, you can instead choose to rollback the client's state update.

For a single component, this is relatively straightforward using variables and updating the UI directly. However, if you have multiple places on the screen that would require to know about the update, manipulating the store directly will take care of these rollbacks for you automatically. That is exactly cache invalidation with [Pinia Colada](https://pinia-colada.esm.dev) is simplifying.