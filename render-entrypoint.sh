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

# render-auth-proxy itself waits for the local MCP server before opening $PORT.
# Wait for that public proxy port using Node (portable in /bin/sh; /dev/tcp is bash-only).
echo "[tunnel] waiting for local Playwright MCP"
if ! node -e '
const net=require("net");
const port=Number(process.env.PORT);
const deadline=Date.now()+65000;
(function probe(){
  const s=net.connect(port,"127.0.0.1");
  s.once("connect",()=>{s.destroy();process.exit(0)});
  s.once("error",()=>{s.destroy(); if(Date.now()>deadline) process.exit(1); setTimeout(probe,250)});
  s.setTimeout(250,()=>{s.destroy(); if(Date.now()>deadline) process.exit(1); setTimeout(probe,250)});
})();'; then
  echo "[tunnel] local MCP did not become ready in time" >&2
  wait "$PROXY_PID"
  exit 1
fi

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
