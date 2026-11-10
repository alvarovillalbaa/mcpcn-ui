# Reference workflows with persistent server execution

Last updated: 2026-11-10

The owning [brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7)
requires five useful examples and server code for every block. The shared server
contract is accepted; the five current examples still log intent or read text
locally. This work implements real reference applications first. Block recipes
remain the next dependent deliverable, not a renamed UI-only completion claim.

Build a local single-operator workbench using the real SDK Client/McpServer,
official AppBridge/OfficialMCPAdapter, the five React apps and an explicitly
selected private SQLite workspace. The workspace persists records, prepared
reviews, atomic mutations and append-only audit events across restarts. It does
not configure another app, charge a card, send a message or call an AI provider.

1. HR: evidence, supplied scores, gaps and risks; persist approve/reject/request
   information decisions and audit. Authored candidate data only in checks.
2. Documents: explicitly submit bounded UTF-8 invoice/contract/resume text;
   return deterministic fields, confidence/source snippets, allow corrections,
   then persist the reviewed document after confirmation. No OCR/PDF claim.
3. Checkout: server-owned line items, integer minor-unit price/shipping/tax and
   return terms; bind confirmation to exact quote revision and persist one local
   order. Clearly report that no payment provider/card charge is connected.
4. Research: gather the configured primary sources through a bounded explicit
   fetch adapter, retain per-source failures/partial results, retry only the
   selected failed source and persist the reviewed final decision. Checks use
   disposable authored source responses; external source acceptance is separate.
5. Admin: show actual stored setting before/after, affected example-user count,
   risk and rollback terms; persist the exact reviewed change and allow a fresh
   reviewed rollback without overwriting a concurrent revision.

The example-only shared infrastructure is a private workspace package. Keep
domain rules and bespoke views in their five owning example folders. Do not
change accepted library/runtime/registry source to hide example implementation.
Use existing locked dependencies; derive new workspace importer edges in CI
without upgrading any external resolution. No new published package is needed.

The server receives a trusted principal at construction, never from tool
arguments. Every read/prepare/commit checks workspace and workflow grants.
Structured content/text contain only deliberate public identifiers/status;
complete views and opaque review tokens use explicit app metadata. Metadata,
visibility and consent UI are not authentication or proof of human identity.
Network-hosted consumers must supply verified authentication themselves.

Prepared reviews bind actor/workspace/workflow/record/current revision/exact
validated proposal/expiry. Confirmation sends only that opaque token. A single
SQLite transaction rechecks the revision, applies the change, appends audit and
consumes the token. Exact-token replay returns the original receipt without
repeating a mutation; a stale,expired,wrong-actor or wrong-workspace token fails.
Browser errors do not automatically retry a potentially completed mutation.
Reload reads durable state/audit to resolve its actual outcome.

The local host binds loopback only, validates Host/Origin, requires an explicitly
entered per-launch capability and uses HttpOnly SameSite=Strict cookies. Bound
body sizes/timeouts/static paths, deny cross-origin access, omit secrets from
logs and close the HTTP server,SDK sessions and database on shutdown. This is
local operator access, not a public multi-user authentication service.

Freeze new authored T2 SQLite/protocol/browser/persistence/type checks before
execution. StorageGuard9.5GiBfree/34GiBrequired prohibits local app imports,
installs,builds,tests,servers,browsers and test databases. Use a new bounded
read-only public CI job and retain actual failed sources/results. The previous
7671file/984333960B source exceeds the old7500file guard: measure and set a new
prospective finite count while preserving the1GiB/40MiBfile/128MiBexport limits.
Prior component/server packets stay closed. Standing owner approval covers this
necessary free source,checks,temporary CI and publication; no paid plan,new
account,provider configuration,production data or model call.
