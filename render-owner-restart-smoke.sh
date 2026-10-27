#!/usr/bin/env bash
# Isolated throwaway disk and credentials. Never point this test at user data.
set -euo pipefail
IMAGE="${SMOKE_IMAGE:-playwright-mcp-render:smoke}"
TMP="$(mktemp -d)"
NAME="jh-owner-restart-ci-$$"
mkdir -p "$TMP/disk"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  sudo rm -rf -- "$TMP"
}
trap cleanup EXIT
start() {
  docker run -d --name "$NAME" --hostname "$1" \
    -e MCP_TOKEN=synthetic-restart-ci -e JH_OWNER_VIEW=1 \
    -e RENDER=true -e RENDER_SERVICE_ID=srv-citest \
    -e RENDER_EXTERNAL_HOSTNAME=localhost -e PLAYWRIGHT_MCP_ALLOWED_HOSTS='*' \
    -v "$TMP/disk:/var/data" "$IMAGE" >/dev/null
}
ready() {
  for _ in $(seq 1 100); do
    if docker exec "$NAME" node -e 'fetch("http://127.0.0.1:10000/mcp").then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then return; fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != true ]]; then break; fi
    sleep .5
  done
  docker logs "$NAME" >&2
  echo 'FAIL: owner browser did not become ready' >&2
  exit 1
}
start old-render-instance
ready
# Prove the lock belongs to the old instance before simulating an abrupt stop.
docker exec "$NAME" node -e 'const f=require("fs");if(!f.readlinkSync("/var/data/jh-browser-profile/SingletonLock").startsWith("old-render-instance-"))process.exit(1)'
docker kill "$NAME" >/dev/null
docker rm "$NAME" >/dev/null
start replacement-render-instance
ready
docker logs "$NAME" 2>&1 | grep -q OWNER_SINGLETON_ARCHIVED_FOR_RETRY
echo 'PASS: stale previous-instance profile lock recovered on first startup'
docker stop --time 15 "$NAME" >/dev/null
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$NAME")" == 0 ]] || { echo 'FAIL: owner container did not exit cleanly' >&2; docker logs "$NAME" >&2; exit 1; }
echo 'PASS: owner container exits cleanly on TERM'
docker rm "$NAME" >/dev/null
docker run --rm --entrypoint node -v "$TMP/disk:/var/data" "$IMAGE" -e 'const f=require("fs");try{f.lstatSync("/var/data/jh-browser-profile/SingletonLock");console.error("FAIL: singleton remained after graceful stop");process.exit(1)}catch(e){if(e.code!=="ENOENT")throw e}'
echo 'PASS: graceful shutdown closes Chromium and releases its singleton'
start third-render-instance
ready
echo 'PASS: next deployment starts with the same persistent profile'
docker stop --time 15 "$NAME" >/dev/null
docker rm "$NAME" >/dev/null

# Hold startup before readiness. PID 1 must forward TERM without waiting for
# the 65-second readiness deadline (Render's shutdown budget is shorter).
cat > "$TMP/slow-start.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
process.on('SIGTERM', () => { writeFileSync('/var/data/term-forwarded', 'ok'); process.exit(0); });
writeFileSync('/var/data/slow-start-ready', 'ok');
setInterval(() => {}, 1000);
JS
docker run -d --name "$NAME" -e JH_OWNER_VIEW=1 \
  -v "$TMP/disk:/var/data" -v "$TMP/slow-start.mjs:/app/render-owner-browser.mjs:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if [[ -f "$TMP/disk/slow-start-ready" ]]; then break; fi
  sleep .1
done
[[ -f "$TMP/disk/slow-start-ready" ]]
docker stop --time 5 "$NAME" >/dev/null
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$NAME")" == 0 ]]
[[ -f "$TMP/disk/term-forwarded" ]]
echo 'PASS: TERM reaches the owner process during readiness wait'
