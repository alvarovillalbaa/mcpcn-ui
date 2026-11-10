# Checkout review

Last updated: 2026-11-10

Inspect the server-owned items,minor-unit prices,shipping,tax,return terms and expiry. Enter an address and accept the terms,then review and confirm the exact quote. The server rechecks expiry/revision and records one uncharged local order. There is no payment/fulfilment provider and no card is charged. Exact-token replay cannot place another order.

Run the [shared workbench](../README.md) from the repository root. Its private
workspace survives restarts. The [React app](src/app.tsx) and
[actual MCP server](src/server.ts) share the [typed contracts](src/contracts.ts)
(`CheckoutStateSchema` and `CheckoutProposalSchema`). Server execution requires a trusted principal;
model/app visibility and UI consent alone do not authorize a mutation.

New implementation and focused checks are being prepared. Do not substitute
older component/server passes for this application acceptance. External hosts,
production identity/providers and physical-device/accessibility proof remain
separate. No paid plan,new account or model call is required for the local path.
