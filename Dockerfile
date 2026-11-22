# syntax=docker/dockerfile:1
# bunnyfit — multi-stage image (SDS §9.2): one image serves the API and the built web UI.
# No secrets are baked in; every setting comes from the environment (.env.example).

ARG NODE_VERSION=22

# ---- base: Node + pnpm (version pinned by package.json "packageManager") ----
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---- build: full install, Prisma client, compile server + web ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm exec prisma generate
COPY tsconfig.json tsconfig.build.json tsconfig.node.json tsconfig.web.json ./
COPY server ./server
COPY web ./web
RUN pnpm run build

# ---- migrate: one-shot job image (prisma migrate deploy / seed need the dev tooling) ----
FROM build AS migrate
CMD ["pnpm", "run", "db:migrate"]

# ---- prod-deps: production dependencies only (generated Prisma client kept) ----
FROM build AS prod-deps
RUN pnpm prune --prod

# ---- runtime (default target): slim, non-root ----
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=8080
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
