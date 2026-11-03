# Development Dockerfile for live reloading
FROM node:24 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=development

# Enable corepack for pnpm
RUN corepack enable

# Set working directory
WORKDIR /app

# Install pnpm with specific version from package.json
# Set CI=true to make corepack non-interactive during build
ENV CI=true
RUN corepack prepare pnpm@12.6.0 --activate

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install all dependencies (including dev dependencies)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Pinned Meilisearch community binary for the local global-search engine. Verify
# the release/checksum before bumping (see the production Dockerfile).
ARG MEILISEARCH_VERSION=v1.12.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init ca-certificates curl \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) meili_arch="amd64" ;; \
         arm64) meili_arch="aarch64" ;; \
         *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /usr/local/bin/meilisearch \
         "https://github.com/meilisearch/meilisearch/releases/download/${MEILISEARCH_VERSION}/meilisearch-linux-${meili_arch}" \
    && chmod +x /usr/local/bin/meilisearch \
    && rm -rf /var/lib/apt/lists/*

# Supervisor script that runs Meilisearch (loopback-only) alongside the dev server.
COPY container_images/firn-entrypoint.sh /usr/local/bin/firn-entrypoint.sh
RUN chmod +x /usr/local/bin/firn-entrypoint.sh

# Instead of copying the source code into the image,
# the app directory is mounted as a volume, see Docker Compose file.
# COPY . .

# Create non-root user (optional for dev, but good practice)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/firn firn && \
    mkdir -p /home/firn && \
    chown -R firn:nodejs /home/firn

# Create directories that Nuxt needs to write to and set ownership
# These directories are excluded from volume mounts in docker-compose.yml
# Change permissions of /app so the firn user can write to .nuxt and .output
RUN mkdir -p /app/.nuxt /app/.output /data/meili && \
    chown -R firn:nodejs /app/.nuxt /app/.output /app/node_modules /data/meili

# Rebuildable search index path for the local engine.
ENV MEILI_DB_PATH=/data/meili

# Set HOME environment variable for the user
ENV HOME=/home/firn

# Switch to non-root user
USER firn

# Expose the development server port
EXPOSE 3000

# Set host to listen on all interfaces (required for Docker)
ENV HOST=0.0.0.0
ENV PORT=3000

# Add metadata labels
LABEL maintainer="Matthias Zepper <MatthiasZepper@users.noreply.github.com>"
LABEL description="NGI Firn - Development environment with live reload"
LABEL org.opencontainers.image.source="https://github.com/NationalGenomicsInfrastructure/ngi-firn"

# Start the development server with hot module replacement, supervised alongside
# the loopback-only Meilisearch engine. dumb-init is PID 1 for signal/zombie
# handling.
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/firn-entrypoint.sh"]
CMD ["pnpm", "dev"]
