# Container Images for NGI Firn

The directory `container_images` contains container images for building and running the NGI Firn application in different environments.

## Docker

### Relevant files

- `./container_images/FrontendProduction.dockerfile` - Production-optimized multi-stage build
- `./container_images/FrontendDevelopment.dockerfile` - Development environment with live reload support
- `docker-compose.dev.yml` - Docker Compose configuration for easy development setup

### Development

#### Using Docker Compose (Recommended)

The easiest way to run the development preview for the frontend:

```bash
docker-compose --profile dev up --build
```

This will only start the Vite development server with live-reload. You can also opt to run a containerized CouchDB instance using the `dev_local_db` profile instead of the `dev` profile:

```bash
docker-compose --profile dev_local_db up --build
```

Alternatively, you can also use a containerized CouchDB instance (`--profile dev_containerized_db`) or our StatusDB development instance (`--profile dev_remote_db`)

#### Using Docker directly

In case you prefer to launch the image manually, you need to bind the source code into the container for live updates of your changes:

```bash
# Build the development image
docker build -f ./container_images/FrontendDevelopment.dockerfile -t ngi-firn:dev .

# Run with volume mounts for live reloading
docker run -p 3000:3000 \
  -v $(pwd)/app:/app/app \
  -v $(pwd)/server:/app/server \
  -v $(pwd)/shared:/app/shared \
  -v $(pwd)/types:/app/types \
  -v $(pwd)/schemas:/app/schemas \
  -v $(pwd)/nuxt.config.ts:/app/nuxt.config.ts \
  -v $(pwd)/uno.config.ts:/app/uno.config.ts \
  -v $(pwd)/tsconfig.json:/app/tsconfig.json \
  -v $(pwd)/eslint.config.mjs:/app/eslint.config.mjs \
  --env-file .env \
  ngi-firn:dev
```

### Production Build

#### Using Docker Compose (Recommended)

You can try out the production build of the web application using Docker with

```bash
docker-compose --profile staging up --build
```

This will only start the node server serving the frontend application. You can also opt to run an additional containerized CouchDB instance using the `staging_local_db` profile instead of the `staging` profile:

```bash
docker-compose --profile staging_local_db up --build
```

Alternatively, you can also use a containerized CouchDB instance (`--profile staging_containerized_db`) or our StatusDB development instance (`--profile staging_remote_db`)

#### Using Docker directly for staging

You can build a production preview with:

```bash
docker build -f container_images/FrontendProduction.dockerfile -t ngi-firn:latest .
```

and then directly run it without Compose:

```bash
docker run -p 3000:3000 \
  --env-file .env \
  -e OTHER_ENV_VAR="value" \
  ngi-firn:latest
```

### Containerized CouchDB

You can use a local installation of CouchDB, our remote StatusDB development instance or a containerized CouchDB for developing Firn. In the latter case, the [CouchDB's official image](https://hub.docker.com/_/couchdb) is being used.

#### Automatic Setup (Docker Compose)

When using the Docker Compose profiles (`dev_containerized_db` or `staging_containerized_db`), CouchDB is automatically configured:

- The `single_node=true` setting in `data/couchdb_config/docker.ini` tells CouchDB to automatically create the required system databases (`_users`, `_replicator`, `_global_changes`) on first startup.
- A `post_start` hook on the database container creates an empty `firn` database once after CouchDB has started.
- A healthcheck ensures the frontend service only starts after CouchDB is fully initialized and the `firn` database exists.

**Development profile (`dev_containerized_db`):** The frontend healthcheck ensures the `firn` database is fully initialized (indexes and first admin user if needed) by running `pnpm db:init` when the DB is empty. Set `FIRST_ADMIN_EMAIL` (e.g. in `.env`) when using an empty database so the first admin user can be created.

**Staging/production profile (`staging_containerized_db`):** The production image does not include init scripts (kept lean and safe). Initialize the database separately before or after starting the stack, e.g. run `pnpm db:init` once from the host or a one-off container with access to the same CouchDB URL and credentials. Ensure `FIRST_ADMIN_EMAIL` is set when creating the first admin.

#### Manual Setup (Standalone containerized CouchDB)

If you're starting the containerized CouchDB outside of Docker Compose for the first time, the official image [lacks system databases](https://hub.docker.com/_/couchdb#no-system-databases-until-the-installation-is-finalized) until configured. You can either:

1. **Set `single_node=true`** in your CouchDB configuration (recommended)
2. **Use the Setup Wizard** at `http://127.0.0.1:5984/_utils#setup`
3. **Create databases manually** using the API ([documentation](https://docs.couchdb.org/en/stable/setup/single-node.html)):

```bash
curl -X PUT http://adm:pass@127.0.0.1:5984/_users
curl -X PUT http://adm:pass@127.0.0.1:5984/_replicator
curl -X PUT http://adm:pass@127.0.0.1:5984/_global_changes
```

Note: The `_global_changes` database is optional if you don't need the global changes feed.