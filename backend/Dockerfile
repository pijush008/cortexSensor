# Production image for the API.
#
# Dockerfile.dev, which this sits beside, mounts the source from the host and
# runs ts-node-dev against it. That is right for a laptop and cannot be
# deployed: the image contains no application code at all.
#
# Multi-stage, so the build toolchain — TypeScript, the Prisma CLI, every
# devDependency — stays out of the thing that actually runs.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not ./backend. The gRPC client loads
# shm/engine/v1/engine.proto at runtime from a path outside this directory, and
# a build rooted at ./backend cannot see it. Build with:
#   docker build -f backend/Dockerfile .

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
# openssl: Prisma's query engine links against it and the slim image omits it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY backend/ ./
# Generate before compiling: the client's types are what tsc checks against.
RUN npx prisma generate && npm run build

# ── production dependencies only ────────────────────────────────────────────
FROM deps AS prod-deps
WORKDIR /app
RUN npm ci --omit=dev
# The generated client lives in node_modules and is NOT restored by npm ci, so
# it has to be regenerated against the pruned tree.
COPY backend/prisma ./prisma
RUN npx prisma generate

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
# Default to the copy baked in below. Overridable, but it must resolve to a real
# file or every analysis request fails at the gRPC client.
ENV SHM_ENGINE_PROTO_PATH=/proto/shm/engine/v1/engine.proto

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/dist         ./dist
COPY backend/package.json ./
# Migrations ship with the image so `prisma migrate deploy` can be run against
# the container without a separate checkout on the server.
COPY backend/prisma ./prisma
# The contract, from the repository root. Read-only at runtime.
COPY proto /proto

# Two directories the process writes to, both created here because /app itself
# is root-owned and the container runs as `node`.
#
# logs/ is not optional: winston builds its File transports at MODULE LOAD, so
# a logger that cannot create its directory throws before any of the app runs.
# Without this the container exited instantly, silently, and with status 0 —
# the throw happened during import, so nothing had been wired up yet to report
# it, and `docker logs` showed nothing at all.
#
# uploads/ is only used when object storage is unconfigured; with Supabase
# Storage set it stays empty, but the directory must still exist.
RUN mkdir -p /app/logs /app/uploads && chown -R node:node /app/logs /app/uploads

USER node
EXPOSE 3001

# Liveness only — /health never touches a dependency, so a database blip does
# not get the container restarted. /ready is for the load balancer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
