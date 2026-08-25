# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates g++ make openssl python3 \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@9.15.9 --activate
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
    pnpm install --frozen-lockfile --filter @cove/judge-worker...

FROM dependencies AS builder
COPY . .
ARG DIRECT_URL=postgresql://build:build@localhost:5432/build
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_URL=$DIRECT_URL
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @cove/shared build \
 && pnpm --filter @cove/judge-worker build \
 && pnpm --filter @cove/judge-worker deploy --prod /opt/cove-judge \
 && cp -R packages/judge-worker/dist /opt/cove-judge/dist

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV JUDGE_HEALTH_PORT=4101
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove
WORKDIR /app
COPY --from=builder --chown=cove:cove /opt/cove-judge ./
USER cove
EXPOSE 4101
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/judge-worker/src/main.js"]
