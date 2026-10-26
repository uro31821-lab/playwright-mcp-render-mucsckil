#!/usr/bin/env bash
# Production-image regression: owner mode must not break authenticated MCP.
# Synthetic data: no actual website accounts, passwords, or phone actions.
set -euo pipefail
IMAGE="${SMOKE_IMAGE:-playwright-mcp-render:smoke}"
TMP="$(mktemp -d)"
NAME="jh-owner-auth-ci-$$"
TOKEN="jh-owner-synthetic-ci-token"
PORT="$(python3 - <<'PY'
import socket
s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()
PY
)"
mkdir -p "$TMP/disk"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  # Chromium creates the test profile as root with mode 0700.
  # This is an ephemeral mktemp directory; GitHub runner can remove it with sudo.
  sudo rm -rf -- "$TMP"
}
trap cleanup EXIT
docker run -d --name "$NAME" \
  -e MCP_TOKEN="$TOKEN" \
  -e JH_OWNER_VIEW=1 \
  -e RENDER_EXTERNAL_HOSTNAME=localhost \
  -e PLAYWRIGHT_MCP_ALLOWED_HOSTS='*' \
  -v "$TMP/disk:/var/data" \
  -p "127.0.0.1:$PORT:10000" "$IMAGE" > /dev/null
URL="http://127.0.0.1:$PORT/mcp"
handshake=""
for _ in $(seq 1 100); do
  code="$(curl --max-time 3 -s -o "$TMP/init.txt" -w '%{http_code}' -D "$TMP/init-headers.txt" \
    -X POST "$URL" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"owner-mode-ci","version":"1"}}}' || true)"
  if [[ "$code" == 200 ]] && grep -q 'Playwright' "$TMP/init.txt"; then
    handshake="OK"; break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != true ]]; then
    echo "Owner mode container exited on startup" >&2; docker logs "$NAME" | tail -60 >&2; exit 1
  fi
  sleep .5
done
if [[ "$handshake" != OK ]]; then
  echo "Owner mode failed authenticated MCP initialize" >&2
  echo "Last HTTP code: ${code:-none}" >&2
  docker logs "$NAME" | tail -60 >&2
  exit 1
fi
echo 'PASS: owner mode authenticated MCP initialize'
unauth="$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' -X POST "$URL" \
  -H 'Content-Type: application/json' -d '{}' || true)"
[[ "$unauth" == 401 ]] || { echo "FAIL: absent bearer got $unauth instead of 401" >&2; exit 1; }
echo 'PASS: unauthenticated request rejected'
SESSION="$(tr -d '\r' < "$TMP/init-headers.txt" | awk 'tolower($1)=="mcp-session-id:" {print $2}' | head -1)"
[[ -n "$SESSION" ]] || { echo 'FAIL: missing MCP session ID' >&2; exit 1; }
rpc() {
  curl -fsS --max-time 50 -X POST "$URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "mcp-session-id: $SESSION" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "$1"
}
rpc '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null
NAV="$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"browser_navigate","arguments":{"url":"data:text/html,<title>owner-auth-test</title><h1>ok</h1>"}}}')"
if ! grep -q 'owner-auth-test' <<<"$NAV"; then echo "FAIL: authenticated browser navigation" >&2; printf '%s\n' "$NAV" | head -c 1200 >&2; exit 1; fi
echo 'PASS: owner mode authenticated browser navigation'
SCREEN="$(rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"browser_take_screenshot","arguments":{}}}')"
if ! grep -q 'owner_view_url' <<<"$SCREEN"; then
  echo 'FAIL: owner view URL not attached to screenshot' >&2
  printf '%s\n' "$SCREEN" | head -c 1200 >&2; exit 1
fi
echo 'PASS: owner view URL offered by selected Playwright screenshot'

# Android Chrome link handoff may append harmless query strings or omit slash.
for path in '/owner/' '/owner/?source=chatgpt' '/owner/?app=android&split=true'; do
  code="$(curl -sS --max-time 8 -o "$TMP/owner.html" -w '%{http_code}' "http://127.0.0.1:$PORT$path")"
  [[ "$code" == 200 ]] || { echo "FAIL: owner viewer GET $path returned $code" >&2; exit 1; }
  grep -qi 'text/html\|owner\|view.js' "$TMP/owner.html" || {
    echo "FAIL: owner viewer GET returned non-HTML for $path" >&2; exit 1;
  }
done
redirect="$(curl -sS --max-time 8 -o /dev/null -D "$TMP/redirect.txt" -w '%{http_code}' "http://127.0.0.1:$PORT/owner?from=chatgpt")"
[[ "$redirect" == 308 ]] || { echo "FAIL: owner path slash redirect returned $redirect" >&2; exit 1; }
grep -qi '^location: /owner/' "$TMP/redirect.txt" || { echo 'FAIL: owner redirect target' >&2; exit 1; }
for asset in '/owner/view.js?v=2' '/owner/view.css?v=2'; do
  code="$(curl -sS --max-time 8 -o "$TMP/owner-asset" -w '%{http_code}' "http://127.0.0.1:$PORT$asset")"
  [[ "$code" == 200 ]] || { echo "FAIL: owner asset $asset returned $code" >&2; exit 1; }
done
bad="$(curl -sS --max-time 8 -o "$TMP/owner-bad" -w '%{http_code}' "http://127.0.0.1:$PORT/owner/claim?ticket=synthetic")"
[[ "$bad" == 404 ]] && grep -q OWNER_VIEW_PATH_INVALID "$TMP/owner-bad" || {
 echo "FAIL: invalid viewer navigation not handled safely ($bad)" >&2; exit 1;
}
echo 'PASS: Android Chrome owner navigation and GET path normalization'
