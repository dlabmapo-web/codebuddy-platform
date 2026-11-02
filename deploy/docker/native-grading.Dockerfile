# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Build with deploy/native/build-image.sh: guest is the measured local immutable ID.
ARG NATIVE_GUEST_IMAGE
FROM ${NATIVE_GUEST_IMAGE} AS guest
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH DOTENV_CONFIG_PATH=/dev/null
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/grading-runtime/package.json packages/grading-runtime/package.json
RUN --mount=type=cache,id=cove-native-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @cove/api... --store-dir /pnpm/store
COPY packages/api packages/api
COPY packages/shared packages/shared
COPY packages/grading-runtime packages/grading-runtime
RUN --mount=type=cache,id=cove-native-pnpm,target=/pnpm/store pnpm --filter @cove/shared build && pnpm --filter @cove/grading-runtime build \
 && DIRECT_URL=postgresql://build:build@127.0.0.1:1/build pnpm --filter @cove/api build \
 && pnpm --filter @cove/api deploy --prod /opt/cove/worker \
 && cp -R packages/api/dist /opt/cove/worker/dist
# This is a private artifact/runtime, not a catch-all privileged container.
FROM guest AS runtime
COPY deploy/native/package-launcher.py /opt/cove/package-launcher.py
RUN apt-get update && apt-get install -y --no-install-recommends patchelf \
 && rm -rf /var/lib/apt/lists/* \
 && python3 /opt/cove/package-launcher.py && cp /usr/local/bin/node /opt/cove/node \
 && readelf -d /opt/cove/nsjail | grep -F '$ORIGIN/launcher-lib'
COPY --from=builder /opt/cove/worker /opt/cove/worker
RUN rm -f /opt/cove/worker/.env.example
COPY deploy/native /opt/cove/tools
ENV NODE_ENV=production DOTENV_CONFIG_PATH=/dev/null
WORKDIR /opt/cove
# No public ports. Required writable mounts and cgroups must be validated first.
ENTRYPOINT ["/opt/cove/node", "/opt/cove/tools/container-preflight.mjs"]
