# Research source review

Last updated: 2026-11-10

Explicitly gather the configured pinned primary-source URLs. Inspect complete source text and partial failures,confirm the gathered record,retry only a chosen failed source,and write/review/confirm a human conclusion. Default reads use a five-second per-source timeout,no redirects and a64KiBcomplete-body limit; oversized/invalid/unavailable sources become failures,never truncated successes. No model generates an answer. Authored checks inject an explicitly reported fixture reader.

Run the [shared workbench](../README.md) from the repository root. Its private
workspace survives restarts. The [React app](src/app.tsx) and
[actual MCP server](src/server.ts) share the [typed contracts](src/contracts.ts)
(`ResearchStateSchema` and `ResearchProposalSchema`). Server execution requires a trusted principal;
model/app visibility and UI consent alone do not authorize a mutation.

New implementation and focused checks are being prepared. Do not substitute
older component/server passes for this application acceptance. External hosts,
production identity/providers and physical-device/accessibility proof remain
separate. No paid plan,new account or model call is required for the local path.
