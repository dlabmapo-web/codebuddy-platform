#!/usr/bin/env bash
# The Cove AI learning assistant on localhost: the real application, database,
# queue and Python grader, with a local stand-in for the model. Requires Docker.
# Uses no shared database and never calls OpenAI, except with --real-model:
# then only invented content goes to the model, with the key in
# packages/api/.env.local, and each monthly limit is $1.
#
#   --playground   start everything with ready accounts and keep it running for
#                  a person to click through, until Ctrl+C; runs no tests
#   --stop         stop a playground started elsewhere, as Ctrl+C would
set -euo pipefail
ai_mode=test
while [[ "${1:-}" == --real-model || "${1:-}" == --playground || "${1:-}" == --stop ]]; do
  case "$1" in
    --real-model) export COVE_AI_ASSISTANT_REAL_MODEL=1 ;;
    --playground) ai_mode=playground ;;
    --stop) ai_mode=stop ;;
  esac
  shift
done
ai_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ai_root"
ai_pid_file="$ai_root/test-results/ai-playground.pid"
if [[ "$ai_mode" == stop ]]; then
  ai_pid="$(cat "$ai_pid_file" 2>/dev/null || true)"
  case "$(ps -p "${ai_pid:-0}" -o command= 2>/dev/null || true)" in
    *test-ai-assistant.sh*--playground*)
      kill -INT "$ai_pid"
      for ai_attempt in {1..60}; do kill -0 "$ai_pid" 2>/dev/null || break; sleep 1; done
      echo 'The AI assistant playground is stopped and deleted.' ;;
    *) echo 'No AI assistant playground is running.' ;;
  esac
  exit 0
fi
for ai_port in 3309 4319 4320; do
  if lsof -nP -iTCP:"$ai_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "AI assistant test port $ai_port is already in use." >&2
    exit 1
  fi
done
ai_run="$(date +%s)-$$"
ai_pg="cove-ai-assistant-pg-$ai_run"
ai_redis="cove-ai-assistant-redis-$ai_run"
ai_build="$(mktemp -d "$ai_root/packages/api/.ai-assistant-e2e-XXXXXX")"
ai_judge=''
ai_api=''
ai_web=''
# A process and everything it started: `pnpm dev` runs Next under it.
stop_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do stop_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}
cleanup() {
  for ai_pid in "$ai_web" "$ai_api" "$ai_judge"; do
    if [[ -n "$ai_pid" ]]; then
      stop_tree "$ai_pid"
      wait "$ai_pid" 2>/dev/null || true
    fi
  done
  docker rm -f "$ai_pg" "$ai_redis" >/dev/null 2>&1 || true
  rm -rf -- "$ai_build"
  if [[ "$ai_mode" == playground && "$(cat "$ai_pid_file" 2>/dev/null || true)" == "$$" ]]; then rm -f "$ai_pid_file"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run -d --name "$ai_pg" -e POSTGRES_PASSWORD=ai-local-only -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
docker run -d --name "$ai_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for ai_attempt in {1..120}; do
  if docker exec "$ai_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
ai_pg_port="$(docker port "$ai_pg" 5432/tcp | sed 's/.*://')"
ai_redis_port="$(docker port "$ai_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:ai-local-only@127.0.0.1:$ai_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$ai_redis_port/0"
export COVE_INTEGRATION_DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL"
export COVE_DLAB_API_BUILD_DIR="file://$ai_build" COVE_AI_ASSISTANT_E2E=1 DOTENV_CONFIG_PATH=/dev/null
docker exec -i "$ai_pg" psql -q -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
pnpm --filter @cove/shared --filter @cove/i18n --filter @cove/grading-runtime build >/dev/null
pnpm --filter @cove/api db:generate >/dev/null
pnpm --filter @cove/api db:migrate:deploy | tail -1
pnpm --filter @cove/api exec tsc -p tsconfig.build.json --outDir "$ai_build" --incremental false --declaration false --sourceMap false
if [[ "${COVE_AI_ASSISTANT_SKIP_UNIT:-0}" != "1" && "$ai_mode" == test ]]; then
  OPENAI_API_KEY='' pnpm --filter @cove/api exec vitest run src/ai-assistant --maxWorkers=1 --testTimeout=60000
fi
# The grader, as its own process. It holds no model key.
mkdir -p test-results
env OPENAI_API_KEY='' NODE_ENV=test REDIS_URL="$COVE_DLAB_TEST_REDIS_URL" WEB_ORIGIN=http://127.0.0.1:3309 \
  SUPABASE_URL=https://dlab-sso-provider.invalid SUPABASE_SECRET_KEY=local-e2e-admin-key \
  BFF_SHARED_SECRET=local-e2e-bff-secret-only-never-production \
  node "$ai_build/src/judge/judge.main.js" > test-results/ai-assistant-judge.log 2>&1 & ai_judge=$!
if [[ "$ai_mode" == test ]]; then
  pnpm exec playwright test --config e2e/ai-assistant.playwright.config.ts "$@"
  exit 0
fi

# The playground: the same API and web the browser test starts.
printf '%s\n' "$$" > "$ai_pid_file"
cp /dev/null test-results/ai-playground.json
node packages/api/scripts/dlab-e2e-server.mjs > test-results/ai-playground-api.log 2>&1 & ai_api=$!
env COVE_DLAB_E2E=1 DLAB_SSO_ENABLED=true BFF_SHARED_SECRET=local-e2e-bff-secret-only-never-production \
  NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3309 NEXT_PUBLIC_API_URL=http://127.0.0.1:4319/api/rpc \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4320 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-e2e-publishable-key NEXT_PUBLIC_TURNSTILE_SITE_KEY= \
  pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3309 > test-results/ai-playground-web.log 2>&1 & ai_web=$!
echo 'Starting the API and the web app (the first start can take a few minutes)...'
for ai_attempt in {1..180}; do
  curl -fsS -o /dev/null http://127.0.0.1:4319/api/health 2>/dev/null && break
  kill -0 "$ai_api" 2>/dev/null || { echo 'The API stopped; see test-results/ai-playground-api.log' >&2; exit 1; }
  sleep 1
done
# Next opens its port late, and compiles the page on the first request.
for ai_attempt in {1..120}; do
  curl -fsS -o /dev/null --max-time 300 http://127.0.0.1:3309/login 2>/dev/null && break
  kill -0 "$ai_web" 2>/dev/null || { echo 'The web app stopped; see test-results/ai-playground-web.log' >&2; exit 1; }
  [[ "$ai_attempt" -lt 120 ]] || { echo 'The web app did not start; see test-results/ai-playground-web.log' >&2; exit 1; }
  sleep 5
done
curl -fsS -X POST http://127.0.0.1:4320/testing/ai-playground > test-results/ai-playground.json
python3 - test-results/ai-playground.json <<'PY'
import json, os, sys
d = json.load(open(sys.argv[1]))
real = os.environ.get("COVE_AI_ASSISTANT_REAL_MODEL") == "1"
print(f'''
================ Cove AI assistant playground ================
Log in at http://127.0.0.1:3309/login   password for everyone: {d["password"]}

  ai_manager   academy manager: edits problems, sees the AI library
  ai_teacher   class teacher: sees students' AI replies
  ai_student   student (English)
  ai_student2  student (Korean)
  ai_admin     operator: switches and cost at /admin/ai

Problems: {", ".join(item["title"] for item in d["problems"])}
First problem (student):  {d["problem"]}
First problem (editor):   {d["editor"]}
Class (teacher):    {d["classPage"]}
Operator page:      {d["operator"]}

Model: {"REAL OpenAI model (costs a little; each monthly limit is $1)" if real else "local stand-in: the same fixed texts every time, no OpenAI call"}
The AI library is written by itself about 1-2 minutes after start.
Use a private window per person, or log out between them.
Press Ctrl+C here, or run this script with --stop, to stop everything and delete the playground.
==============================================================
''')
PY
wait "$ai_api"
