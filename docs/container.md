# Container Images for NGI Firn

The directory `container-images` contains container images for building and running the NGI Firn application in different environments.

## Docker

### Relevant files

- `./container-images/FrontendProduction.dockerfile` - Production-optimized multi-stage build
- `./container-images/FrontendDevelopment.dockerfile` - Development environment with live reload support
- `docker-compose.dev.yml` - Docker Compose configuration for easy development setup

### Development

#### Using Docker Compose (Recommended)

The easiest way to run the development preview for the frontend:

```bash
docker-compose --profile dev up --build
```

This will only start the Vite development server with live-reload. You can also opt to run a containerized CouchDB instance using the `dev-local-db` profile instead of the `dev` profile:

```bash
docker-compose --profile dev-local-db up --build
```

Alternatively, you can also use a containerized CouchDB instance (`--profile dev-containerized-db`) or our StatusDB development instance (`--profile dev-remote-db`)

#### Using Docker directly

In case you prefer to launch the image manually, you need to bind the source code into the container for live updates of your changes:

```bash
# Build the development image
docker build -f ./container-images/FrontendDevelopment.dockerfile -t ngi-firn:dev .

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

This will only start the node server serving the frontend application. You can also opt to run an additional containerized CouchDB instance using the `staging-local-db` profile instead of the `staging` profile:

```bash
docker-compose --profile staging-local-db up --build
```

Alternatively, you can also use a containerized CouchDB instance (`--profile staging-containerized-db`) or our StatusDB development instance (`--profile staging-remote-db`)

#### Using Docker directly for staging

You can build a production preview with:

```bash
docker build -f container-images/FrontendProduction.dockerfile -t ngi-firn:latest .
```

and then directly run it without Compose:

```bash
docker run -p 3000:3000 \
  --env-file .env \
  -e OTHER_ENV_VAR="value" \
  ngi-firn:latest
```
