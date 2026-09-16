# Production image for the web app.
#
# Built from next.config.ts's `output: "standalone"`, which emits a server with
# only the files it actually reaches. Copying .next plus the full node_modules
# instead would carry several hundred megabytes of build-time dependencies that
# never execute.
#
# Build context is ./frontend.

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, not
# read at runtime, so anything the browser needs has to be present here.
#
# Deliberately left unset by default: with no value, src/lib/api.ts falls back
# to the relative "/api", which nginx routes to the backend on the same origin.
# That is the arrangement this deployment uses, and a relative path is what lets
# one image serve any hostname.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# public/ and .next/static are not inside the standalone bundle; the server
# expects to find them beside it.
COPY --from=build /app/public                      ./public
COPY --from=build /app/.next/standalone            ./
COPY --from=build /app/.next/static                ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
