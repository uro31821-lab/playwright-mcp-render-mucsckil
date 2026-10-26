# Owner handoff upgrade: review status (2026-10-25, Korea)

Scope: upgrade the existing Playwright service with a clickable same-page control
link and a persistent login profile. Source base: `main` at `0ddd2a6`.

Implemented: single-use owner links, full-resolution mobile view, click/text/key/scroll
input, login popup handling, temporary MCP pause, explicit return of control, original
bearer authorization and optional Secure MCP Tunnel through the same control fence,
disk-backed browser profile, and refusal to activate on ephemeral storage.

Validation:

- 20 existing auth-proxy/limiter tests passed.
- 11 owner-control tests passed (access, origin, expiry, replay, stale coordinates,
  exact target, manual fencing, release, and response binding).
- 2 real Chromium tests passed: direct owner input into the selected second tab,
  valid synthetic login and localStorage after browser restart, revoked authentication
  returning to a login form, and persistent-mount enforcement.
- Full MCP integration test is implemented but blocked locally by the execution
  environment's denied Unix socket binding (`listen EPERM`). An exact-production-image
  CI job is included and must pass before activating the feature.
- Real Naver/Gmail accounts, production login persistence, remote phone viewer, and
  deployed service behavior remain unverified. No production change has been made.

Publishing status: the local branch is `feat/playwright-owner-handoff`. Automatic
approval review refused the Git push because it would publish implementation code to
the public repository without explicit publication consent. No alternate publication
route was used. Review the local changes before approving publication and CI.

Deployment also requires adding a 1 GB persistent disk to the existing browser service
at `/var/data`, then setting `JH_OWNER_VIEW=1`. This is a billed infrastructure change;
the current Render connector does not expose disk creation. Use the existing service's
Dashboard for disk attachment after authorization. Existing live behavior remains
active until validation and activation are complete.
