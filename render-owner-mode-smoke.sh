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
# Simulate a Chromium singleton symlink left behind by the previous Render
# disk-backed instance. Never use actual user credentials or profile data.
mkdir -p "$TMP/disk/jh-browser-profile"
ln -s 'old-render-hostname-999999' "$TMP/disk/jh-browser-profile/SingletonLock"
ln -s '/tmp/old-render-singleton-socket' "$TMP/disk/jh-browser-profile/SingletonSocket"
ln -s 'synthetic-cookie' "$TMP/disk/jh-browser-profile/SingletonCookie"
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
# Real ChatGPT link taps add ?utm_source=chatgpt.com to the viewer path.
# That GET must work without bearer authentication. Unknown query variations
# must not bypass the strict owner routing or single-use POST claim gate.
VIEW="$(curl -sS --max-time 8 -o "$TMP/view.html" -w '%{http_code}' "http://127.0.0.1:$PORT/owner/?utm_source=chatgpt.com")"
[[ "$VIEW" == 200 ]] && grep -qi '<html' "$TMP/view.html" || {
  echo "FAIL: ChatGPT-tagged owner viewer returned HTTP $VIEW" >&2; exit 1;
}
BAD_VIEW="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/owner/?utm_source=attacker.invalid")"
[[ "$BAD_VIEW" == 403 ]] || {
  echo "FAIL: unexpected owner viewer query returned HTTP $BAD_VIEW, expected 403" >&2; exit 1;
}
echo 'PASS: ChatGPT-tagged owner viewer opens, unexpected viewer queries rejected'
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
if ! grep -q 'expires_in_seconds' <<<"$SCREEN" || ! grep -q '1800' <<<"$SCREEN"; then
  echo 'FAIL: screenshot owner link TTL differs from server 30-minute claim window' >&2
  exit 1
fi
echo 'PASS: owner view URL offered with matching 30-minute transfer window'
