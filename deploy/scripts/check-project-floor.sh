#!/usr/bin/env bash
# Refuses an application rollback that would grade multi-file C/C++ wrongly.
#
# A multi-file problem keeps its files in programming_exercises.source_project
# and its learners' code as a file bundle. An API from before that release
# ignores the column and would compile the whole bundle as one main.c: every
# attempt would fail to compile, and the read-only and hidden files would be
# lost. Submissions frozen with a version 6 policy are refused by an older
# judge, but new ones would still be admitted. The floor is the release whose
# client knows source_project. Turn the problems back into single files, or
# roll forward. See §8 of
# docs/superpowers/specs/2026-11-19-c-cpp-multi-file-design.md.
#
# Runs while the current API is still up; reads nothing but one count.
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
target_env="${1:?Target deployment env required}"
override="${COVE_ROLLBACK_PAST_SOURCE_PROJECTS:-}"

target_api="$(python3 - "$target_env" <<'PY'
import pathlib, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    key, separator, value = line.strip().partition("=")
    if separator and key.strip() == "API_IMAGE":
        print(value.strip().strip("\"'"))
PY
)"
[[ -n "$target_api" ]] || { echo 'Target release names no API_IMAGE' >&2; exit 2; }

# `to_jsonb(pe)` reads source_project on a database before or after its migration.
if ! rows="$(compose exec -T api node -e '
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query(`SELECT (SELECT count(*) FROM programming_exercises pe WHERE to_jsonb(pe) -> \x27source_project\x27 IS NOT NULL AND to_jsonb(pe) -> \x27source_project\x27 <> \x27null\x27::jsonb)
    + (SELECT count(*) FROM submissions WHERE grading_policy_snapshot ->> \x27version\x27 = \x276\x27) AS n`))
  .then((result) => { console.log(String(result.rows[0].n)); return client.end(); })
  .catch((error) => { console.error(String(error)); process.exit(2); });
')"; then
  if [[ "$override" == "yes-I-checked" ]]; then
    echo 'Could not count multi-file rows; continuing because COVE_ROLLBACK_PAST_SOURCE_PROJECTS is set.' >&2
    exit 0
  fi
  echo 'Could not count multi-file rows through the running API. Verify none exist, then set COVE_ROLLBACK_PAST_SOURCE_PROJECTS=yes-I-checked.' >&2
  exit 1
fi
rows="${rows//[^0-9]/}"
[[ "${rows:-0}" -eq 0 ]] && exit 0

docker pull --quiet "$target_api" >/dev/null
if docker run --rm --network none --entrypoint grep "$target_api" -rqs "source_project" /app/dist/src/generated/prisma; then
  exit 0
fi
echo "Refusing rollback: $rows multi-file C/C++ problems or submissions exist, and the target API ($target_api) cannot read them." >&2
echo 'Make those problems single-file in the editor, or roll forward instead.' >&2
exit 1
