#!/usr/bin/env bash
set -euo pipefail
native_source="${1:?Sanitized Next source required}";native_auth="${2:?Auth origin}";native_api="${3:?API origin}";native_web="${4:?Web origin}"
native_source="$(cd -- "$native_source" && pwd)"
node -e 'for(const v of process.argv.slice(1)){const u=new URL(v);if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||!u.port)throw Error("Loopback fixture required")}' "$native_auth" "$native_api" "$native_web"
native_port="${native_web##*:}"
native_node="${5:-$(command -v node)}"
cd "$native_source/packages/web"
exec env -i PATH="$PATH" HOME=/nonexistent DOTENV_CONFIG_PATH=/dev/null NEXT_TELEMETRY_DISABLED=1 \
 NEXT_PUBLIC_SUPABASE_URL="$native_auth" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-public-key \
 NEXT_PUBLIC_API_URL="$native_api/api/rpc" NEXT_PUBLIC_SITE_URL="$native_web" INTERNAL_API_RPC_URL="$native_api/api/rpc" \
 BFF_SHARED_SECRET=local-native-bff-secret-only-never-production \
 "$native_node" --max-old-space-size=384 "$native_source/packages/web/node_modules/next/dist/bin/next" start "$native_source/packages/web" --hostname 127.0.0.1 --port "$native_port"
