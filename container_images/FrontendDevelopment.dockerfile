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
RUN corepack prepare pnpm@10.29.3 --activate

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install all dependencies (including dev dependencies)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

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
RUN mkdir -p /app/.nuxt /app/.output && \
    chown -R firn:nodejs /app/.nuxt /app/.output /app/node_modules

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

# Start the development server with hot module replacement
CMD ["pnpm", "dev"]
