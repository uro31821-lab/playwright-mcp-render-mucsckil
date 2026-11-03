# JHAI on-demand assistance

Host-triggered consultation in the user's current conversation. Natural-language intent belongs to the host; the adapter consumes a validated scoped request and reads the existing JH dialogue, decision, and personalization runtimes.

The packaged `jh-ebiseo-assist` skill supports direct address, advice, reference and current-task assistance without fixed command phrases. It distinguishes active requests from quotations, negation, hypothetical examples and questions about the assistant. It does not remotely wake another chat or grant execution authority.

`context.mjs` and `installed-runtime.mjs` provide the executable read-only bridge. The skill's `references/host-flow.md` documents its input and output. Existing private stores remain separate and unchanged by consultation. Cross-thread task-specific feedback remains historical evidence. No actual private state is included in this directory.

Run `node --test host-ebiseo-assist/*.test.mjs` from the repository root. Existing dependency regressions are also exercised by the corresponding CI workflow. Run `node host-ebiseo-assist/sync-overlay.mjs` after modifying bundled implementation files. The overlay adds the invocation skill and the main entry route, preserving all existing App and MCP bindings.
