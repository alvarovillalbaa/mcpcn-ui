# Workspace settings review

Last updated: 2026-11-10

Inspect actual stored preferences and listed example members. Propose weekly-digest/retention preferences,review before/after values and confirm. A rollback also requires a fresh reviewed revision and cannot overwrite a concurrent change. The real server persists preferences/audit in the reference workspace; it does not configure SSO,send digests or delete files.

Run the [shared workbench](../README.md) from the repository root. Its private
workspace survives restarts. The [React app](src/app.tsx) and
[actual MCP server](src/server.ts) share the [typed contracts](src/contracts.ts)
(`AdminStateSchema` and `AdminProposalSchema`). Server execution requires a trusted principal;
model/app visibility and UI consent alone do not authorize a mutation.

The [focused acceptance](../../docs/results/2026/11-10/reference-workflow-checks.md)
passed real local SDK/browser/persistence checks. External hosts,
production identity/providers and physical-device/accessibility proof remain
separate. No paid plan,new account or model call is required for the local path.
