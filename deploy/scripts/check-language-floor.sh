#!/usr/bin/env bash
# Refuses an application rollback that could not read C/C++ rows.
#
# Once any exercise or submission is C or CPP, an API whose Prisma client
# predates those enum values fails to read it. Deleting exercises does not
# help: submissions keep their language (`Submission.material` is SetNull).
# Switch C/C++ off with the native eligibility and C_CPP_EXERCISES instead,
# and roll forward. See §9 of
# docs/superpowers/specs/2026-11-09-c-cpp-execution-design.md.
#
# Runs while the current API is still up; reads nothing but two counts.
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
target_env="${1:?Target deployment env required}"
override="${COVE_ROLLBACK_PAST_COMPILED_LANGUAGES:-}"

target_api="$(python3 - "$target_env" <<'PY'
import pathlib, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    key, separator, value = line.strip().partition("=")
    if separator and key.strip() == "API_IMAGE":
        print(value.strip().strip("\"'"))
PY
)"
[[ -n "$target_api" ]] || { echo 'Target release names no API_IMAGE' >&2; exit 2; }

# `language::text` works on a database before or after the C/C++ migration.
if ! rows="$(compose exec -T api node -e '
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query(`SELECT (SELECT count(*) FROM programming_exercises WHERE language::text IN (\x27C\x27, \x27CPP\x27))
    + (SELECT count(*) FROM submissions WHERE language::text IN (\x27C\x27, \x27CPP\x27)) AS n`))
  .then((result) => { console.log(String(result.rows[0].n)); return client.end(); })
  .catch((error) => { console.error(String(error)); process.exit(2); });
')"; then
  if [[ "$override" == "yes-I-checked" ]]; then
    echo 'Could not count C/C++ rows; continuing because COVE_ROLLBACK_PAST_COMPILED_LANGUAGES is set.' >&2
    exit 0
  fi
  echo 'Could not count C/C++ rows through the running API. Verify none exist, then set COVE_ROLLBACK_PAST_COMPILED_LANGUAGES=yes-I-checked.' >&2
  exit 1
fi
rows="${rows//[^0-9]/}"
[[ "${rows:-0}" -eq 0 ]] && exit 0

docker pull --quiet "$target_api" >/dev/null
if docker run --rm --network none --entrypoint grep "$target_api" -q "CPP: 'CPP'" /app/dist/src/generated/prisma/enums.js; then
  exit 0
fi
echo "Refusing rollback: $rows C/C++ exercises or submissions exist, and the target API ($target_api) cannot read them." >&2
echo 'Turn C/C++ off with the native eligibility languages and C_CPP_EXERCISES, and roll forward instead.' >&2
exit 1
