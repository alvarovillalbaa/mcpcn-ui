# Persistent reference workflows

Last updated: 2026-11-10

These five applications connect real MCP tools to React review surfaces and a
private local SQLite workspace. Their
[focused acceptance](../docs/results/2026/11-10/reference-workflow-checks.md)
passed80selectedcases,22desktop/narrow browser profiles,real server restart
persistence and a fresh focused source install/build/five SDK workflows.
See the [contract](../docs/specs/reference-workflows.md) for the deliberate scope.

Use Node24.22.2 and pnpm10.24.0. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm examples:build
pnpm examples:dev --workspace /absolute/private/reference-workspace
```

The last command creates only the explicitly selected, empty private directory,
or reopens a recognized reference workspace owned by the current OS user. Its
files require private Unix permissions. Existing unrelated directories/databases
are refused. Open the printed loopback address and enter the per-launch access
code. Do not share that code or expose the workbench through a tunnel. The
workbench currently targets macOS/Linux; Windows access/file permissions are
not verified. Press Ctrl-C to close HTTP,SDK sessions and SQLite. Relaunch with
the same workspace path to read saved records and audit events. Back up the
whole private workspace while it is closed; never commit its contents.

| Application | Real local workflow | Deliberate boundary |
| --- | --- | --- |
| [Candidate review](hr-candidate-review/README.md) | Inspect supplied evidence,scores,gaps and risks; record approve/reject/request-information decisions with notes/audit. | No automated hiring decision,candidate contact or employment offer. |
| [Document extraction](document-extraction/README.md) | Submit UTF-8 invoice/contract/resume text,inspect source matches,correct fields and confirm their persistent save. | Deterministic labeled-line extraction; no PDF/OCR or model. |
| [Checkout](ecommerce-checkout-review/README.md) | Review server-owned prices,shipping,tax,return terms and address; record one exact uncharged order. | No card charge,payment or fulfilment provider. |
| [Settings](admin-settings-change/README.md) | Apply exact reviewed reference preferences and a fresh reviewed rollback against the current revision. | No SSO,notification sender or deletion worker. |
| [Research](research-workflow/README.md) | Read configured pinned primary sources,inspect complete text/partial failures,retry one failed source and save a human conclusion. | No generated model answer. Network reads are explicit; source availability may fail. |

Every confirmation requires a fresh unchecked acknowledgement. Prepared terms
expire after five minutes and bind actor,workspace,workflow,record,revision and
proposal. The server checks the current revision again inside a transaction,
updates the record,appends audit and consumes the opaque token together. Exact
token replay returns its original receipt without another change. A network
error does not prove failure: reload and inspect saved state/audit before trying
another action. The UI never automatically retries confirmation.

Only identifiers,status and receipts are model-visible. Complete views,source
text,addresses,reviewer notes and prepared review tokens use explicit app
metadata. Metadata is visible to the host and is not authentication or secret
storage. The example factories require a trusted principal and enforce workspace
and workflow grants. The local host derives that principal from its selected
private workspace and OS operator. A public or multi-user deployment must map
verified transport authentication to principals itself; do not trust tool args.

The workbench serves only its trusted built-in apps. Its single iframe uses
same-origin script and form access; it is not a sandbox for arbitrary third-party HTML.
Actual SDK traffic connects AppBridge,OfficialMCPAdapter,Client and McpServer.
Browser calls and resources are protected by loopback Host/Origin checks and a
short-lived HttpOnly SameSite cookie. No API credential or Auth provider setup
is needed. The source,not a mock tool handler,performs the persistent changes.

The [Node24SQLite API](https://raw.githubusercontent.com/nodejs/node/v24.22.2/doc/api/sqlite.md)
and [pinned AppBridge](https://github.com/modelcontextprotocol/ext-apps/blob/v1.7.5/src/app-bridge.ts)
own the underlying APIs. External-host compatibility,public npm distribution,
production identity/providers and full accessibility/device acceptance remain
separate from the authored local workflow checks. Block server recipes are the
next dependent library deliverable.
