# Reference application infrastructure

Last updated: 2026-11-10

Private workspace package for the five [reference apps](../README.md).
`contracts.ts` owns model-safe identifiers and private review/audit DTOs.
`store.ts` owns SQLite revision checks,prepared tokens,atomic mutations,receipts
and audit. `server.ts` registers each domain's four real MCP tools and resource.
`client.tsx` validates returned views and fences pending/stale operations.
`workbench-host.ts` owns local capability/cookie access and actual SDK sessions;
`browser-host.tsx` owns the trusted built-in iframe/AppBridge connection.

Keep business rules and bespoke views in the five application folders. This is
not a new published library package,an Auth service or a provider integration.
No tool argument may supply a trusted principal. Records/audit persist in the
selected private workspace; only expired unconsumed review tokens are discarded.
Full source text remains intact within explicit byte limits and is rendered as
text. Snapshot lists show the latest100audit entries and disclose earlier events
retained in SQLite. Current schema version1 refuses foreign/unsupported databases;
there is no automatic migration or destructive reset.
