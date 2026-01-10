FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 firn
USER firn

# Expose the port the app runs on
EXPOSE 3000

# Set host to listen on all interfaces
# ENV HOST=0.0.0.0

CMD [ "pnpm", "start" ]