#!/usr/bin/env bash
# Switches the AI assistant off before restoring an API that predates it.
#
# `AI_ASSISTANT` is a value of the `AcademyFeature` enum. An API whose Prisma
# client predates it fails to read a feature list holding that value, so one
# academy with AI switched on would break that academy's feature reads after
# the rollback. The older API has no AI to offer: only those switch rows are
# removed. Replies, libraries and usage stay for the roll forward, after which
# an operator switches AI on again. See §3.3 of
# docs/superpowers/specs/2026-11-25-cove-ai-learning-assistant-data.md.
#
# Runs while the current API is still up, before anything stops.
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
target_env="${1:?Target deployment env required}"
override="${COVE_ROLLBACK_PAST_AI_ASSISTANT:-}"

target_api="$(python3 - "$target_env" <<'PY'
import pathlib, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    key, separator, value = line.strip().partition("=")
    if separator and key.strip() == "API_IMAGE":
        print(value.strip().strip("\"'"))
PY
)"
[[ -n "$target_api" ]] || { echo 'Target release names no API_IMAGE' >&2; exit 2; }

# `feature::text` works on a database before or after the AI migration.
ai_switches() {
  compose exec -T api node -e '
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const sql = process.argv[1] === "clear"
  ? `DELETE FROM academy_feature_flags WHERE feature::text = \x27AI_ASSISTANT\x27`
  : `SELECT count(*) AS n FROM academy_feature_flags WHERE feature::text = \x27AI_ASSISTANT\x27`;
client.connect()
  .then(() => client.query(sql))
  .then((result) => { console.log(String(result.rows[0]?.n ?? result.rowCount)); return client.end(); })
  .catch((error) => { console.error(String(error)); process.exit(2); });
' "$1"
}

if ! rows="$(ai_switches count)"; then
  if [[ "$override" == "yes-I-checked" ]]; then
    echo 'Could not count AI assistant switches; continuing because COVE_ROLLBACK_PAST_AI_ASSISTANT is set.' >&2
    exit 0
  fi
  echo 'Could not count AI assistant switches through the running API. Verify none exist, then set COVE_ROLLBACK_PAST_AI_ASSISTANT=yes-I-checked.' >&2
  exit 1
fi
rows="${rows//[^0-9]/}"
[[ "${rows:-0}" -eq 0 ]] && exit 0

docker pull --quiet "$target_api" >/dev/null
if docker run --rm --network none --entrypoint grep "$target_api" -q "AI_ASSISTANT: 'AI_ASSISTANT'" /app/dist/src/generated/prisma/enums.js; then
  exit 0
fi
if ! cleared="$(ai_switches clear)"; then
  echo "Refusing rollback: could not switch the AI assistant off, and the target API ($target_api) cannot read it." >&2
  exit 1
fi
echo "Switched the AI assistant off (${cleared//[^0-9]/} academy rows): the target API ($target_api) predates it. Switch it on again after rolling forward." >&2
