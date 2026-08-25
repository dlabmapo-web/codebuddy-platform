# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make openssl python3 \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@9.15.9 --activate \
 && chmod -R a+rX "$COREPACK_HOME"
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/home/package.json packages/home/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/judge-worker/package.json packages/judge-worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @cove/api...

FROM dependencies AS builder
COPY . .
ARG DIRECT_URL=postgresql://build:build@localhost:5432/build
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_URL=$DIRECT_URL
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @cove/shared build \
 && pnpm --filter @cove/api build \
 && pnpm --filter @cove/api deploy --prod /opt/cove-api \
 && cp -R packages/api/dist /opt/cove-api/dist

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=4000
# The built service needs Node only; package managers add unused attack surface.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tini \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove
WORKDIR /app
COPY --from=builder --chown=cove:cove /opt/cove-api ./
USER cove
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/main.js"]

# Prisma CLI is intentionally kept out of the API runtime. This target is a
# one-shot migration image and is never started as a long-running service.
FROM dependencies AS migration
COPY . .
ENV NODE_ENV=production
ARG DIRECT_URL=postgresql://build:build@localhost:5432/build
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_URL=$DIRECT_URL
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @cove/api db:generate \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/corepack /pnpm \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx \
 && groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove \
 && chown -R cove:cove /app
USER cove
WORKDIR /app/packages/api
# Invoke Prisma directly so the final one-shot image does not retain pnpm.
ENTRYPOINT ["node", "node_modules/prisma/build/index.js"]
CMD ["migrate", "deploy"]
