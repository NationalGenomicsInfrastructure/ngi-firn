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
RUN corepack prepare pnpm@10.22.0 --activate

# STAGE: Production dependencies stage (mind the --prod flag)
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

# STAGE: Build stage with all dependencies installed
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
# Copy the application source code
COPY . .
# Build the application (runs the build script defined in package.json)
RUN pnpm run build

# STAGE: Final production stage
FROM base AS production

# Copy production dependencies from the production dependencies stage
COPY --from=prod-deps /app/node_modules /app/node_modules

# Copy built application from the build stage
COPY --from=build /app/.output /app/.output

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 firn

# Switch to non-root user
USER firn

# Expose the port the app runs on
EXPOSE 3000

# Set host to listen on all interfaces (required for Docker)
ENV HOST=0.0.0.0
ENV PORT=3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Add metadata labels
LABEL maintainer="Matthias Zepper <MatthiasZepper@users.noreply.github.com>"
LABEL description="NGI Firn - Laboratory freezer inventory management system"
LABEL org.opencontainers.image.source="https://github.com/NationalGenomicsInfrastructure/ngi-firn"

# Start the production server
CMD ["pnpm", "start"]