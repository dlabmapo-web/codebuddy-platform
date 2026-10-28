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
COPY packages/turtle-browser-runtime/package.json packages/turtle-browser-runtime/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @cove/web... --filter @cove/turtle-browser-runtime

FROM dependencies AS builder
COPY . .
ARG DEPLOYMENT_VERSION=local
ARG NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-placeholder
ARG NEXT_PUBLIC_API_URL=https://api.coveedu.com/api/rpc
ARG NEXT_PUBLIC_SITE_URL=https://cs.coveedu.com
ARG NEXT_PUBLIC_GUI_ENABLED=false
ARG NEXT_PUBLIC_TURTLE_TRIAL_ENABLED=false
ARG NEXT_PUBLIC_SHORT_ANSWER_ENABLED=false
ARG NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED=false
ARG NEXT_PUBLIC_VIDEO_LESSONS_ENABLED=false
ARG NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
ARG NEXT_PUBLIC_NAVER_AUTH_ENABLED=false
ARG NEXT_PUBLIC_KAKAO_AUTH_ENABLED=false
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GUI_ENABLED=$NEXT_PUBLIC_GUI_ENABLED
ENV NEXT_PUBLIC_TURTLE_TRIAL_ENABLED=$NEXT_PUBLIC_TURTLE_TRIAL_ENABLED
ENV NEXT_PUBLIC_SHORT_ANSWER_ENABLED=$NEXT_PUBLIC_SHORT_ANSWER_ENABLED
ENV NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED=$NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED
ENV NEXT_PUBLIC_VIDEO_LESSONS_ENABLED=$NEXT_PUBLIC_VIDEO_LESSONS_ENABLED
ENV NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
ENV NEXT_PUBLIC_NAVER_AUTH_ENABLED=$NEXT_PUBLIC_NAVER_AUTH_ENABLED
ENV NEXT_PUBLIC_KAKAO_AUTH_ENABLED=$NEXT_PUBLIC_KAKAO_AUTH_ENABLED
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN TURTLE_BROWSER_PARENT_ORIGIN="$NEXT_PUBLIC_SITE_URL" pnpm --filter @cove/turtle-browser-runtime build \
 && pnpm --filter @cove/shared --filter @cove/i18n build \
 && pnpm --filter @cove/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# The built service needs Node only; package managers add unused attack surface.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove
WORKDIR /app
COPY --from=builder --chown=cove:cove /app/packages/web/.next/standalone ./
COPY --from=builder --chown=cove:cove /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=cove:cove /app/packages/web/public ./packages/web/public
COPY --from=builder --chown=cove:cove /app/packages/turtle-browser-runtime/dist /opt/cove/turtle-browser-runtime
USER cove
EXPOSE 3000
CMD ["node", "packages/web/server.js"]
