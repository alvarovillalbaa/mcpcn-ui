# Shared playground public-delivery preparation

Status: preparation only. No passing CI oracle has been adopted and no HTTP
execution, deployment, workflow activation or browser acceptance is implied.
The [shared playground packet](playground-checks.md) must first pass in full.
Its failed first packet and all earlier receipts retain their original verdicts.

The [inactive workflow](../examples/playground-public-delivery.workflow.yml)
defines one manual-only public Ubuntu job, capped at four minutes, with pinned
checkout/Node 24.22.2 and read-only contents permission. It accepts the exact
reviewed deployed `source_sha` and independently observed `deployment_id`.
Before dispatch, the owner must verify the actual READY deployment's source and
canonical `https://mcpcn-ui.vercel.app` assignment through provider metadata.
These supplied metadata bindings are distinct from anonymous HTTP evidence.

The job first runs the unchanged [seven-route checker](../../tooling/check-v1-public-delivery.mjs),
retaining its `MCPCN_V1_PUBLIC_DELIVERY_RESULT` independently. The new
[artifact checker](../../tooling/check-playground-public-delivery.mjs) then emits
`MCPCN_PLAYGROUND_PUBLIC_DELIVERY_RESULT`. Either failed result keeps the job
failed. There are no installs, application imports, child processes, browser,
credentials, cookies, authorization headers, bypass tokens, redirects or retries.
Only the fixed canonical origin is contacted using anonymous TLS GET requests.

The new checker requires these future source-controlled originals; their absence
or an incomplete/failed CI receipt fails before any new HTTP observation:

- `docs/results/2026/11-08/playground-asset-manifest.json`: exact original manifest.
- `docs/results/2026/11-08/playground-checks-originals/receipt.json`: complete raw
  passing controller receipt, at most 4 MiB; it is not a summary substituted for
  the original machine result.
- `docs/results/2026/11-08/playground-asset-oracle.json`: small metadata record:

```json
{
  "schemaVersion": "mcpcn.playground-asset-oracle.v1",
  "checkedSourceCommit": "<passing CI source, full SHA>",
  "checkedWorkflowCommit": "<passing CI workflow, full SHA>",
  "runId": "<positive actual run ID>",
  "jobId": "<positive actual job ID>",
  "receipt": { "path": "docs/results/2026/11-08/playground-checks-originals/receipt.json", "bytes": 0, "sha256": "<full original hash>" },
  "manifest": { "path": "docs/results/2026/11-08/playground-asset-manifest.json", "bytes": 0, "sha256": "<full original hash>" }
}
```

The displayed placeholders are a contract example, not an accepted oracle; real
sizes must be positive. The checker binds both originals by bytes/SHA, actual CI
source/workflow, 76 units, twelve browser cases, both installed consumers, docs
and playground typechecks/builds, deterministic tested generation and complete
owned cleanup with zero unknown/remaining processes. Process observations may
retain only bounded, fully enumerated vanished/reused-PID rows,
with exact count/disposition parity; unreadable or unproved identities still fail.
Every passing asset-check
location must equal the retained manifest and file vector; all four Vite,
CLI-staged, docs-staged and installed-CLI copies must have been observed. The
later deployed comparison SHA includes evidence publication and remains distinct
from that passing CI source. Run/job IDs are supplied retained metadata, not
independently looked up or proven by HTTP.

Requests run sequentially: `/playground`, the public
`/playground-simulator/asset-manifest.json`, then every file in the accepted
manifest. The anticipated Vite artifact has seven files; the actual passing
manifest controls the request list, bounded to 64 safe relative paths. The two
HTML entry points are mandatory; source maps and arbitrary public-directory
passthrough are not permitted. Each full asset body must match its passing CI
byte count and SHA256, with a fixed MIME allowlist by extension. Manifest object
key order may differ; array order and every JSON value must match. The SSR check
removes script/style/comment contents and requires the actual title plus exactly
one `MCPCN host simulator` iframe with the exact public index source. It makes
no claim that JavaScript executed or that the iframe negotiated a bridge.

Each new request has a 15-second absolute bound inside 60 seconds total, including
terminal validation. Acceptance requires HTTP 200, authorized TLS, complete body,
response end/close, request close and socket close; aborts, redirects, stream or
length errors fail. The manifest cap is 32 KiB, each asset 4 MiB, all assets
16 MiB, SSR HTML 1 MiB and all responses together 17 MiB plus 32 KiB. The bounded
32 KiB report retains statuses, sizes, hashes, comparison results and closure,
not full response bodies. No TLS/proxy override or credential environment is
copied into requests or dumped into the result.

The earliest job clock reserves the original checker's 95-second admission,
65 seconds for the new helper and a 30-second margin. Both helpers retain their
own absolute deadlines, and the source SHA/clean checkout is checked before and
after both. The new helper rereads all comparison originals and its relevant
source files to detect changes. Output markers remain separate, without combining
the two observations into a fictitious single browser or all-docs-assets run.

This future boundary covers only the SSR wrapper and all files of this particular
passing shared artifact. It does not establish all documentation assets,
interaction, accessibility, physical devices, arbitrary-HTML isolation, external
MCP/tool/model behavior, package publication or future availability. Local
preparation uses source inspection, Node syntax and whitespace checks only.
