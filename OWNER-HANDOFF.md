# JH existing Playwright: owner view and retained login

This release adds an owner-only link to successful `browser_take_screenshot` results.
The existing JH `life_web_screenshot` wrapper carries the result, so no new phone APK
or MCP tool name is required. The link resolves to the exact selected Playwright tab,
including its login popups, in the existing browser service.

## Owner flow

1. The assistant obtains a fresh screenshot and presents `owner_view_url` as a link.
2. The owner opens the link and clicks **화면 열고 직접 조작**. This pauses MCP page
   reads and writes without dropping the MCP session. Tool metadata remains available.
3. The owner clicks the target field, enters text in the local input box and submits it
   to that field. Passwords/OTP are never entered in ChatGPT. Scroll buttons and the
   full-resolution pannable canvas support small text/QR on mobile.
4. **완료 · GPT에 돌려주기** revokes manual access. The assistant reads the current page
   and verifies the intended service/account before continuing the authorized task.
   A user pressing Done is not proof of login success. Nothing is replayed automatically.

Links last five minutes and are single-use. Manual access lasts ten minutes. Closing
the tab leaves the browser paused until that limit; a subsequent explicit Done revokes
it immediately. A new browser operation invalidates earlier unclaimed links. Refreshing
the viewer requires a fresh link; capabilities are held only in page memory.

## Deployment prerequisites (not yet applied)

Target: existing Render **playwright-mcp** / `srv-dap99htg1s2s739t0bl0`, branch `main`,
Dockerfile `Dockerfile.render`. Do not deploy the Android/JH bridge for this change.

1. Complete unit tests, existing container smoke checks and the new exact-image
   integration test. The feature defaults off to keep the existing path working.
2. Attach a persistent disk to this existing service at `/var/data` (1 GB initially).
   This is an additional billed resource; adding it causes a deploy and a brief interruption.
   The live service had no disk at inspection on 2026-10-25. The Render connector in this
   session cannot attach disks; the existing service's Dashboard Disk page is required.
3. Set `JH_OWNER_VIEW=1` on this service and deploy the validated commit. Keep existing
   MCP_TOKEN and JH_BROWSER_MCP_TOKEN unchanged. `RENDER_EXTERNAL_HOSTNAME` supplies the
   viewer origin. Public MCP path and bearer authorization are unchanged.
4. The existing optional Secure MCP Tunnel connects through the same manual-control
   fence using a private ingress on `127.0.0.1:8932`; it must never address the upstream
   backend directly in owner mode. The tunnel keeps its existing authorization and
   identity. The ingress provides no viewer endpoints and is not publicly bound.
   Existing JH uses the bearer-protected Render `/mcp` endpoint. Legacy `/sse` message
   routes are unavailable in owner mode; Streamable HTTP `/mcp` is used.
5. The runner refuses to start if `/var/data` is not an actual mounted disk. The profile
   directory `/var/data/jh-browser-profile` has owner-only permissions. Browser profile
   state is never committed, returned in MCP results or copied into a download.

## Verification and release gate

The integration test uses synthetic credentials and checks two tabs (the unselected tab
must remain untouched), user input, MCP pause/resume, cookie/localStorage retention after
a clean browser restart, and a revoked login returning to a login form. It runs against
the production image in CI. Never replace it with a test on a user's mailbox.

After deployment, verify each actual site/account separately: Naver, Gmail and any other
requested site. Record initial login, reopen, server restart/redeploy and authentication
expiry outcomes. A persistent profile retains valid site-issued state; it cannot extend
expired or revoked authentication. Reauthentication/challenges may still be required by
the site. Same-site account switching follows the site's current account selection; this
release does not silently choose or isolate multiple accounts within one site.

If any release check fails, retain the existing deployment. Disabling `JH_OWNER_VIEW`
restores the old startup path but does not delete the stored profile. Do not delete the
disk as a rollback. No real login persistence or production deployment is implied by
committing this code or by passing synthetic tests.
