#!/usr/bin/env bash
# Hermetic loopback test of the owner-mode Secure MCP Tunnel ingress.
# No real tunnel token or remote website is used.
set -euo pipefail
IMAGE="${SMOKE_IMAGE:-playwright-mcp-render:smoke}"
TMP="$(mktemp -d)"
NAME="jh-owner-tunnel-ci-$$"
mkdir -p "$TMP/disk"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  sudo rm -rf -- "$TMP"
}
trap cleanup EXIT
docker run -d --name "$NAME" \
  --entrypoint node \
  -e PORT=10000 -e UPSTREAM_PORT=8931 \
  -e JH_OWNER_VIEW=1 -e MCP_TOKEN=synthetic-ci-bearer \
  -e CONTROL_PLANE_API_KEY=ci-synthetic -e CONTROL_PLANE_TUNNEL_ID=ci-synthetic \
  -e RENDER_EXTERNAL_HOSTNAME=playwright-mcp-yzcy.onrender.com \
  -e PLAYWRIGHT_MCP_ALLOWED_HOSTS=playwright-mcp-yzcy.onrender.com \
  -v "$TMP/disk:/var/data" "$IMAGE" /app/render-owner-browser.mjs >/dev/null
code=""
for _ in $(seq 1 50); do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != true ]]; then
    echo 'FAIL: owner-mode launcher exited unexpectedly' >&2
    docker logs "$NAME" | tail -70 >&2; exit 1
  fi
  code="$(docker exec "$NAME" /bin/sh -c "curl -s --max-time 5 -o /tmp/jh-tunnel-response -w '%{http_code}' \
    -X POST http://127.0.0.1:8932/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"tunnel-ci\",\"version\":\"1\"}}}'" 2>/dev/null || true)"
  if [[ "$code" == 200 || "$code" == 400 || "$code" == 403 || "$code" == 405 ]]; then break; fi
  sleep .5
done
if [[ "$code" != 200 ]]; then
  echo "FAIL: private JH tunnel ingress initialize returned HTTP ${code:-no-response}" >&2
  docker exec "$NAME" sh -c 'head -c 450 /tmp/jh-tunnel-response || true' >&2 || true
  docker logs "$NAME" | tail -60 >&2
  exit 1
fi
docker exec "$NAME" sh -c "grep -q Playwright /tmp/jh-tunnel-response" || {
 echo 'FAIL: tunnel ingress did not carry MCP server info' >&2; exit 1;
}
echo 'PASS: owner mode trusted loopback tunnel reaches Playwright MCP despite its internal Host header'
