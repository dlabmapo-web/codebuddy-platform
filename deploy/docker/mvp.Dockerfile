# syntax=docker/dockerfile:1.7
# Build context is a checkout of the explicitly approved `main` commit.
FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm-mvp,target=/root/.npm \
    npm ci
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3200
RUN groupadd --system --gid 1001 cove \
 && useradd --system --uid 1001 --gid cove --home-dir /app cove
WORKDIR /app
COPY --from=builder --chown=cove:cove /app/package.json ./
COPY --from=builder --chown=cove:cove /app/node_modules ./node_modules
COPY --from=builder --chown=cove:cove /app/.next ./.next
COPY --from=builder --chown=cove:cove /app/public ./public
USER cove
EXPOSE 3200
CMD ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3200"]
