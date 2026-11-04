FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

# Enable corepack for pnpm
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
# If only source code changes, the dependency installation layer of the image can be reused.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install pnpm with specific version from package.json
# Set CI=true to make corepack non-interactive during build
ENV CI=true
RUN corepack prepare pnpm@12.6.0 --activate

# STAGE: Production dependencies stage (mind the --prod flag)
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

# STAGE: Build stage with all dependencies installed
FROM base AS build
# Install dependencies without running postinstall (which runs nuxt prepare)
# Before the source code is copied, so Nuxt can't generate type definitions and auto-imports.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
    
# Copy the application source code
COPY . .

# Run nuxt prepare to generate type definitions and auto-imports
RUN pnpm exec nuxt prepare

# Build the application (runs the build script defined in package.json)
RUN pnpm run build

# STAGE: Final production stage
FROM base AS production

# Pinned Meilisearch community binary. The exact release and its checksum MUST be
# verified against https://github.com/meilisearch/meilisearch/releases before
# changing this value. When MEILISEARCH_SHA256 is supplied the download is
# checksum-verified; leave it empty to skip (not recommended for releases).
ARG MEILISEARCH_VERSION=v1.56.1
ARG MEILISEARCH_SHA256=sha256:b2c7a647d4cdfdd7a901466bfd6797077b849e90f5eb2c0f5b1d05869592e27e

# Install dumb-init (PID 1 signal/zombie handling) and the pinned Meilisearch
# binary matching the image architecture.
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
    && if [ -n "$MEILISEARCH_SHA256" ]; then \
         echo "${MEILISEARCH_SHA256}  /usr/local/bin/meilisearch" | sha256sum -c -; \
       fi \
    && chmod +x /usr/local/bin/meilisearch \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies from the production dependencies stage
COPY --from=prod-deps /app/node_modules /app/node_modules

# Copy built application from the build stage
COPY --from=build /app/.output /app/.output

# Supervisor script that runs Meilisearch (loopback-only) alongside the app.
COPY container_images/firn-entrypoint.sh /usr/local/bin/firn-entrypoint.sh
RUN chmod +x /usr/local/bin/firn-entrypoint.sh

# Create non-root user for security hardening and a dedicated, writable volume
# for the rebuildable search index.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/firn firn && \
    mkdir -p /home/firn /data/meili && \
    chown -R firn:nodejs /home/firn /app/node_modules /data/meili

# Rebuildable search index lives here; mounting a volume keeps it across restarts.
VOLUME ["/data/meili"]
ENV MEILI_DB_PATH=/data/meili

# Set HOME environment variable for the user
ENV HOME=/home/firn

# Switch to non-root user
USER firn

# Expose only the application port. Meilisearch stays on 127.0.0.1:7700 and is
# deliberately NOT exposed.
EXPOSE 3001

# Set host to listen on all interfaces (required for Docker)
ENV HOST=0.0.0.0
ENV PORT=3001

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Add metadata labels
LABEL maintainer="Matthias Zepper <MatthiasZepper@users.noreply.github.com>"
LABEL description="NGI Firn - Laboratory freezer inventory management system"
LABEL org.opencontainers.image.source="https://github.com/NationalGenomicsInfrastructure/ngi-firn"

# dumb-init as PID 1 forwards signals and reaps zombies; the supervisor script
# then starts Meilisearch and the production server together.
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/firn-entrypoint.sh"]
CMD ["node", "/app/.output/server/index.mjs"]