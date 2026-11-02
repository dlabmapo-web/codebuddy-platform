#!/usr/bin/env bash
# Build real Next from a fresh source copy, never load/rename checkout dotenv files.
set -euo pipefail
native_repo="$(cd "$(dirname "$0")/../.." && pwd)";native_dest="${1:?New sanitized source directory required}"
native_auth="${2:?Explicit loopback auth origin}";native_api="${3:?Explicit loopback API origin}";native_web="${4:?Explicit loopback Next origin}"
node -e 'for(const v of process.argv.slice(1)){const u=new URL(v);if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||!u.port)throw Error("Loopback fixture origin required")}' "$native_auth" "$native_api" "$native_web"
mkdir -m 700 "$native_dest"
# Tracked allowlist only; excludes dotenv, auth state, artifacts and dependencies before copying.
python3 - "$native_repo" "$native_dest" <<'PY'
import pathlib,subprocess,sys,shutil
root,dest=map(pathlib.Path,sys.argv[1:])
for raw in subprocess.check_output(['git','-C',str(root),'ls-files','-z']).split(b'\0'):
 if not raw:continue
 rel=pathlib.Path(raw.decode())
 if not (rel.parts[0] in ('packages',) or str(rel) in ('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json')):continue
 if rel.parts[0]=='packages' and rel.parts[1] not in ('web','shared','i18n','turtle-browser-runtime'):continue
 if any(p.startswith('.env') or p in ('node_modules','.next','.auth') for p in rel.parts):continue
 path=root/rel
 if path.is_symlink():continue
 target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
for name in ('web','shared','i18n','turtle-browser-runtime'):
 target=dest/'packages'/name/'node_modules';target.symlink_to(root/'packages'/name/'node_modules',target_is_directory=True)
 if name!='web' and (root/'packages'/name/'dist').exists():shutil.copytree(root/'packages'/name/'dist',dest/'packages'/name/'dist')
(dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
PY
# PUBLIC values are frozen at build time; server RPC/BFF uses matching synthetic config.
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 DOTENV_CONFIG_PATH=/dev/null \
 NEXT_PUBLIC_SUPABASE_URL="$native_auth" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-public-key \
 NEXT_PUBLIC_API_URL="$native_api/api/rpc" NEXT_PUBLIC_SITE_URL="$native_web" \
 INTERNAL_API_RPC_URL="$native_api/api/rpc" BFF_SHARED_SECRET=local-native-bff-secret-only-never-production \
 pnpm --dir "$native_dest/packages/web" exec next build --webpack
