#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_in_container() {
  local service="$1"
  local url="$2"
  compose exec -T "$service" node -e \
    "fetch('$url',{redirect:'manual'}).then(r=>{if(r.status<200||r.status>=400){console.error(r.status);process.exit(1)}}).catch(e=>{console.error(e.message);process.exit(1)})"
}

check_in_container home http://127.0.0.1:3100/
check_in_container studio http://127.0.0.1:3000/login
check_in_container api http://127.0.0.1:4000/api/health/ready
check_in_container mvp http://127.0.0.1:3200/login
check_in_container judge-worker http://127.0.0.1:4101/health

if [[ "${1:-}" == "--public" ]]; then
  require_command curl
  for url in \
    https://coveedu.com/ \
    https://cs.coveedu.com/login \
    https://api.coveedu.com/api/health/ready \
    https://mvp.coveedu.com/login; do
    curl --fail --silent --show-error --location \
      --connect-timeout 10 --max-time 30 --output /dev/null "$url"
  done
fi

printf 'Production smoke tests passed.\n'
