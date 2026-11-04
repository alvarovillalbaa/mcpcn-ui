# Docs, archives and installed consumers

Last updated: 2026-11-04

Owner-authorized; prepared and unrun. The owner's standing “I approve everything”
and “Keep going / Do all the work” instructions cover this concrete continuation
of the [source-installation scope](source-installation-checks.md). The existing
[52-case pass](../results/2026/11-04/source-installation-52-checks.md) remains at
its own immutable source and will not be rerun for unrelated consumer changes.

## Scope

One public Ubuntu 24.04 job, Node 24.21.0, pnpm 10.24.0, TypeScript 5.9.3,
capped at twenty minutes. Use the unchanged frozen workspace lock, with lifecycle
scripts disabled and fresh owned HOME/config/store/cache/temp directories.
Local Storage Guard measured 22.3 GiB free against 34 GiB required; no local
dependency installation, package/app build or consumer launch is permitted.

Build core, schemas, runtime, React, themes, registry and CLI packages, then run
their canonical source generator. Require every tracked registry/license byte
to remain identical. Build only the docs app; do not call the broad workspace
check or release scripts. Pack those seven packages into owned local tarballs,
without publishing them, and retain their exact identities, hashes and licenses.

Run the repaired `tooling/verify-consumers.ts` against the seven archives:

1. Source-copy consumer: install the exact prepared third-party dependency pins
   and TypeScript 5.9.3 into the disposable consumer itself,
   invoke the compiled source CLI, add all 79 entries, verify complete per-file
   ownership/license/provider configuration and copied-source import closure,
   then perform strict no-emit compilation with that consumer's installed compiler.
2. Package consumer: install all seven local archives, invoke the actual installed
   `node_modules/.bin/mcpcn` executable launcher, add all 79 entries, verify
   installed package identities/licenses, declared JS/type/CSS/bin targets and
   package-mode output/provider, then use its own installed TypeScript compiler.
   Match the two packaged CSS assets to their workspace source bytes. Verify
   launcher resolution remains inside the owned consumer and points to its
   installed CLI. These are artifact/file checks; they do not import CSS in Node
   or establish every host/runtime behavior.

Both consumers use `skipLibCheck: true`, as prepared. They check application
source and public API usage, not every transitive declaration or framework.
Record each generated npm lock hash: fresh transitive resolution is not claimed
to reproduce the workspace's entire dependency graph. Package downloads are
the external network use; no host/MCP/tool/model/provider connection is invoked.

## Lifecycle repair and execution evidence

Source review found that the old harness could settle on leader closure, cancel
TERM-to-KILL escalation and drop ownership before verifying original process-group
absence. Its signal handlers could also disappear before cleanup/reporting.
Repair those paths before launch. Add only two focused, disposable owned process
regressions: leader closure with a surviving TERM-resistant process group, and
repeated interruption during cleanup/reporting. These are separate from the two
consumer scenarios. This is a source finding; no consumer
runtime failure has been observed yet. Keep repeated signals covered through
cleanup/reporting and record exit, stream close, group absence and finite bounds.

The two lifecycle case identities are:

- `leader close keeps a surviving owned group through TERM and KILL`: retain
  ownership after the leader closes, escalate for the authored survivor and
  verify direct-child exit/close plus original-group absence before removal.
- `repeated signals remain handled during cleanup and report`: keep repeated
  interruption handled through drain/reporting, retain cancellation as a failure
  condition and require verified owned process and fixture cleanup.

The outer work/cleanup budgets are 900/60 seconds, reserving the last two cleanup
seconds for bounded final stdout and retaining signal handlers through its
terminal callback/timeout. The helper has twelve minutes
of work and a thirty-second final cleanup/report reserve. Its outer command
allows 750 seconds and requires at least 756 seconds remaining, including the
outer three-second TERM-to-KILL and further three-second drain window. Do not
launch if the remaining outer budget cannot contain them. Internal command
streams are capped at 256 KiB, with 32 KiB compressed per stream and 128 KiB
compressed in total. The helper report/stdout is capped at 512 KiB. The outer
controller retains that report once, requiring exact stdout/report equality,
as lossless gzip of at most 192 KiB. Lifecycle evidence is capped at 128 KiB raw /
32 KiB gzip; ordinary outer streams at 128 KiB each / 64 KiB aggregate gzip;
the final outer JSON at 512 KiB. Overflow is failure, not permission to truncate
an accepted result. These are evidence/storage limits, not performance claims.

The outer controller must guard the complete source/input set, HEAD, full index
and working bytes before execution, after generation/docs build and afterward,
including failure. No tracked generated-file exception is allowed. Preserve all
historical seals and results. Keep tool caches outside consumer fixture storage.
Require both consumer outcomes and teardown to pass; command exit alone is
insufficient. Retain bounded, lossless raw reports/phase logs and exact runtime
and archive identities. Never turn an unavailable report or forced settlement
into success. Direct-child/original-group evidence does not inventory all separate
descendant sessions or establish eventual ephemeral-runner disposal.
If a helper report is missing/incomplete or its nested process cleanup cannot
be verified, retain the owned fixture storage and record failed/unverified
cleanup. Original-group absence for the outer helper alone cannot establish
absence of its separately grouped children.

## Publication and isolation

The complete source seal is `docs/results/2026/11-04/consumer-checks-source.json`.
The inactive workflow is `docs/examples/consumer-checks.workflow.yml`; root pins
its immutable preparation SHA in the temporary active copy. Only exact public
repository `alvarovillalbaa/mcpcn-ui` and the fresh branch-create event for
`qa/mcpcn-consumers-20261104` may start this job. Use pinned actions, read-only
contents permission and checkout without persisted credentials. Child build/test
environments receive no account or publishing credentials.

Main preparation, activation and final publication use `[skip ci]` so the
existing main-push CI/npm release workflows stay unchanged and unexecuted by
this packet. Preserve the two prior 52-check branch bookmarks. After retaining
the terminal outcome, remove only the new temporary workflow, publish the final
receipt and fast-forward its owned branch to that final source as a retired
bookmark. No branch deletion is claimed. Preserve failed attempts before repair.

This does not establish public npm availability, native browser interaction,
accessibility, live MCP hosts, production hosting or full-library readiness.
The old protected staging READY result is separate. No account creation, paid
plan, model call, database, dependency upgrade, Auth change or promotion is
included. Remaining library/distribution/hosted requirements stay open.
