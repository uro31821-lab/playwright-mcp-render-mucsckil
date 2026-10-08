// Candidate transport for the existing Render JH browser path.
// No credentials or live server configuration are included.
const ENDPOINT = "https://playwright-mcp-yzcy.onrender.com/mcp";

export function createBrowserTransport({
  endpoint = process.env.JH_BROWSER_MCP_URL,
  token = process.env.JH_BROWSER_MCP_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  maxBytes = 4 * 1024 * 1024
} = {}) {
  // Fail at invocation, not at module import: unavailable browser configuration
  // must not disable unrelated MCP and phone-status paths.
  return {
    async request(options = {}) {
      if (endpoint !== ENDPOINT) throw new Error("browser_endpoint_configuration_required");
      if (typeof token !== "string" || token.length < 24 || token.length > 512 ||
          !/^[\x21-\x7e]+$/.test(token)) {
        throw new Error("browser_service_credential_required");
      }
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
          !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 8 * 1024 * 1024) {
        throw new Error("browser_transport_limits_invalid");
      }
      if (options.method !== "POST" || typeof options.body !== "string" ||
          Buffer.byteLength(options.body) > 1024 * 1024) {
        throw new Error("browser_request_invalid");
      }
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const controller = new AbortController();
      let expired = false;
      let reader;
      const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("browser_deadline")), {once:true});
      });
      try {
        // Exactly one attempt. A timeout never authorizes replay of a browser action.
        const response = await Promise.race([
          fetchImpl(ENDPOINT, {
            method: "POST", headers, body: options.body,
            redirect: "error", signal: controller.signal
          }), aborted
        ]);
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          const code = response.status === 401 || response.status === 403
            ? "browser_service_authentication_failed"
            : response.status >= 300 && response.status < 400
              ? "browser_redirect_refused"
              : `browser_http_${response.status}`;
          // Do not include upstream response bodies, URLs, headers or credentials.
          throw new Error(code);
        }
        const chunks = [];
        let size = 0;
        if (response.body) {
          reader = response.body.getReader();
          for (;;) {
            const part = await Promise.race([reader.read(), aborted]);
            if (part.done) break;
            size += part.value.byteLength;
            if (size > maxBytes) throw new Error("browser_response_too_large");
            chunks.push(Buffer.from(part.value));
          }
        }
        const outputHeaders = new Headers(response.headers);
        for (const key of ["content-length", "content-encoding", "transfer-encoding"]) {
          outputHeaders.delete(key);
        }
        return new Response(chunks.length ? Buffer.concat(chunks) : null, {
          status: response.status, headers: outputHeaders
        });
      } catch (error) {
        if (expired) throw new Error("browser_request_timeout_no_automatic_retry");
        if (/^browser_(service_authentication_failed|redirect_refused|http_\d{3}|response_too_large)$/.test(error.message)) {
          throw error;
        }
        throw new Error("browser_transport_failed_no_automatic_retry");
      } finally {
        clearTimeout(timer);
        if (reader) void reader.cancel().catch(() => {});
      }
    }
  };
}

// tools/list adds top-level security metadata before ending the response. Remove
// the obsolete byte count BEFORE writeHead sends it; leave auth and body intact.
export function installCatalogFraming(response) {
  const originalWriteHead = response.writeHead;
  response.writeHead = function (...args) {
    this.removeHeader("content-length");
    const index = typeof args[1] === "string" ? 2 : 1;
    const headers = args[index];
    if (Array.isArray(headers)) {
      if (headers.length % 2 !== 0) return originalWriteHead.apply(this, args);
      const filtered = [];
      for (let i = 0; i < headers.length; i += 2) {
        if (String(headers[i]).toLowerCase() !== "content-length") filtered.push(headers[i], headers[i + 1]);
      }
      args[index] = filtered;
    } else if (headers && typeof headers === "object") {
      args[index] = Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "content-length"));
    }
    return originalWriteHead.apply(this, args);
  };
}
