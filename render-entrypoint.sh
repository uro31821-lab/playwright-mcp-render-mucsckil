#!/bin/sh
set -eu

PORT="${PORT:-10000}"
UPSTREAM_PORT="${UPSTREAM_PORT:-8931}"
ALLOWED_HOSTS="${PLAYWRIGHT_MCP_ALLOWED_HOSTS:-${RENDER_EXTERNAL_HOSTNAME:-*}}"
export PORT UPSTREAM_PORT

echo "[startup] Public MCP endpoint: https://${RENDER_EXTERNAL_HOSTNAME:-localhost:$PORT}/mcp"
echo "[startup] Starting Playwright MCP on loopback and authenticated Render proxy"

node /usr/local/bin/render-auth-proxy.mjs \
  node /app/cli.js \
  --headless --browser chromium --no-sandbox \
  --host 127.0.0.1 --port "$UPSTREAM_PORT" \
  --allowed-hosts "$ALLOWED_HOSTS" &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Wait until the local Playwright MCP port is ready.
i=0
while ! (echo >/dev/tcp/127.0.0.1/"$UPSTREAM_PORT") 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 120 ]; then
    echo "[tunnel] local MCP did not become ready in time" >&2
    wait "$PROXY_PID"
    exit 1
  fi
  sleep 0.5
done

# Optional OpenAI Secure MCP Tunnel. This lets ChatGPT reach this cloud-hosted
# Playwright server without exposing the bearer token to ChatGPT.
if [ -n "${CONTROL_PLANE_API_KEY:-}" ] && [ -n "${CONTROL_PLANE_TUNNEL_ID:-}" ]; then
  echo "[tunnel] connecting OpenAI Secure MCP Tunnel"
  if tunnel-client runtimes connect \
      --alias playwright-cloud \
      --tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
      --mcp-server-url "http://127.0.0.1:$UPSTREAM_PORT/mcp"; then
    tunnel-client runtimes status playwright-cloud || true
  else
    echo "[tunnel] connection failed; public bearer-protected endpoint remains available" >&2
  fi
else
  echo "[tunnel] CONTROL_PLANE_API_KEY / CONTROL_PLANE_TUNNEL_ID not set; secure tunnel disabled"
fi

wait "$PROXY_PID"
