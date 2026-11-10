# Document extraction review

Last updated: 2026-11-10

Choose a UTF-8 .txt or .md invoice,contract or resume no larger than64KiB. Explicitly prepare extraction,inspect the complete supplied text and labeled-line source matches,and confirm. Correct every required field,prepare the save and confirm again. Literal-line confidence is parser evidence,not semantic certainty. The real server saves the source and corrections with audit; no PDF/OCR or AI service is connected.

Run the [shared workbench](../README.md) from the repository root. Its private
workspace survives restarts. The [React app](src/app.tsx) and
[actual MCP server](src/server.ts) share the [typed contracts](src/contracts.ts)
(`DocumentStateSchema` and `DocumentProposalSchema`). Server execution requires a trusted principal;
model/app visibility and UI consent alone do not authorize a mutation.

New implementation and focused checks are being prepared. Do not substitute
older component/server passes for this application acceptance. External hosts,
production identity/providers and physical-device/accessibility proof remain
separate. No paid plan,new account or model call is required for the local path.
