#!/usr/bin/env bash
set -euo pipefail
url=https://www.guelfi.com.br/
for attempt in 1 2 3; do
  code=$(curl --max-time 10 --silent --show-error --output /dev/null --write-out '%{http_code}' --user-agent 'Mozilla/5.0 (compatible; OCI-Deploy-Check/1.0)' "$url") || code=000
  printf 'Public verification attempt %s: HTTP %s\n' "$attempt" "$code"
  if [[ "$code" == 200 ]]; then
    echo 'Public HTTPS verification passed.'
    exit 0
  fi
  if [[ "$attempt" != 3 ]]; then sleep 5; fi
done
echo '::error::Public HTTPS endpoint did not return HTTP 200 after three attempts.'
exit 1
