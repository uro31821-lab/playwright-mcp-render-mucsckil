import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const ORIGINAL_SHA = "952390b3d78547cc694566745f4aa4d5e4ad90d6c1fa35a156037cb50ce9f435";
const TRANSPORT_SHA = "f7efc249c303323b370a08044688526f144732084576229b09e4296816855b96";
const PATCHED_SHA = "dcba8647ca02c5ca2feccb4fb9d1f665d9a2e1d9d75720588f7e19fbb5101851";
const BEFORE = 'const BROWSER_MCP = "http://life-browser-agent.railway.internal:8931/mcp";';
const AFTER = 'const browserTransport = createBrowserTransport();';
const IMPORT = 'import {createBrowserTransport} from "../../browser-transport.mjs";\n';

// Applied only AFTER the existing entry verifies its unchanged auth/diagnostic runtime.
// Does not load credentials, open listeners, change OAuth, or write the persistent disk.
export function patchBrowserRuntime(bytes) {
  if (!Buffer.isBuffer(bytes) || sha(bytes) !== ORIGINAL_SHA) throw Error("browser_parent_runtime_identity_mismatch");
  const source = bytes.toString("utf8");
  if (source.split(BEFORE).length !== 2 || source.split("fetch(BROWSER_MCP,{").length !== 4)
    throw Error("browser_runtime_anchors_mismatch");
  const output = IMPORT + source.replace(BEFORE, AFTER).replaceAll("fetch(BROWSER_MCP,{", "browserTransport.request({");
  const restored = output.slice(IMPORT.length).replace(AFTER, BEFORE).replaceAll("browserTransport.request({", "fetch(BROWSER_MCP,{");
  if (restored !== source || sha(output) !== PATCHED_SHA) throw Error("browser_patch_scope_or_identity_mismatch");
  return Buffer.from(output, "utf8");
}

export function prepareBrowserRuntime() {
  const input = new URL("./verification-output/candidate/server.mjs", import.meta.url);
  const transport = new URL("./browser-transport.mjs", import.meta.url);
  if (sha(readFileSync(transport)) !== TRANSPORT_SHA) throw Error("browser_transport_identity_mismatch");
  const output = patchBrowserRuntime(readFileSync(input));
  const target = new URL("./verification-output/candidate/server-browser.mjs", import.meta.url);
  const temporary = new URL("./verification-output/candidate/server-browser.mjs.tmp", import.meta.url);
  writeFileSync(temporary, output, {mode:0o600});
  renameSync(temporary, target);
  if (sha(readFileSync(target)) !== PATCHED_SHA) throw Error("browser_runtime_readback_mismatch");
  return target;
}
