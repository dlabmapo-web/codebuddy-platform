# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
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
    pnpm install --frozen-lockfile --filter @cove/home...

FROM dependencies AS builder
COPY . .
ARG DEPLOYMENT_VERSION=local
ARG NEXT_PUBLIC_STUDIO_URL=https://cs.coveedu.com
ARG NEXT_PUBLIC_MVP_URL=https://mvp.coveedu.com
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
ENV NEXT_PUBLIC_STUDIO_URL=$NEXT_PUBLIC_STUDIO_URL
ENV NEXT_PUBLIC_MVP_URL=$NEXT_PUBLIC_MVP_URL
RUN pnpm --filter @cove/i18n build \
 && pnpm --filter @cove/home build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3100
# The built service needs Node only; package managers add unused attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove
WORKDIR /app
COPY --from=builder --chown=cove:cove /app/packages/home/.next/standalone ./
COPY --from=builder --chown=cove:cove /app/packages/home/.next/static ./packages/home/.next/static
COPY --from=builder --chown=cove:cove /app/packages/home/public ./packages/home/public
USER cove
EXPOSE 3100
CMD ["node", "packages/home/server.js"]
