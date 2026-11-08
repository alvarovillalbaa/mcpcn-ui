# Form workflows — second invocation failed in editable installation

8 November 2026. **Failed**, with partial observations retained.
[Run42502186738](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42502186738),
job128797135607, source061707012331d282c06bea7af6bc5d88349d7c8d,
separate workflow7da0491b345af17faf34a9fa4fb7dd7b2a3056c6.

The React narrowing repair compiled. All110 new unit/SSR cases passed, docs
reported82 pages, and the fresh package consumer passed its five actual SSR
renders and strict TypeScript check. The editable consumer stopped at
C02-copy-cli-add79 with exit1 and exact stderr `mcpcn: registry_too_large`.
Its copied-source typecheck, emission and SSR were not reached; no browser case
ran. The outer error `consumer_report_identity` preserves this failed consumer
report rather than accepting its partial results.

The CLI's cumulative source budget was16MiB. It intentionally counts shared
module content for every selected item, before deduplication. Data-only
inspection of the actual generated79 payloads found16,940,972 declared UTF-8
source bytes, exceeding16,777,216. Their103 unique paths total238,526 bytes;
the largest item JSON is244,785 bytes, below the unchanged2MiB per-item limit.
The aggregate registry index is18,046,060 bytes, within its prospective32MiB
bound. This failure is cumulative installation accounting, not index loading.

All46 outer commands terminated with92 complete original streams. Four full
1747-file canonical source guards passed. Owned cleanup removed its root with
zero remaining processes and no uncertainty; four vanished observations were
recorded, with zero stable-unreadable or identity-recheck failures. The consumer's
twelve inner commands also terminated, with complete streams, no signals and
all original groups absent. See the [complete failed receipt](form-workflow-attempt-2-originals/receipt.json)
and [original consumer report](form-workflow-attempt-2-originals/output-consumers.json).

The [decode manifest](form-workflow-attempt-2-originals/decode-manifest.json)
binds106 normal originals and the generated gzip. The separately retained raw
log is16,725,751 bytes, SHA256
`488c2a5b95774503b6d7dd12323a80d549a3596ee3fef603180d4af83093271d`.
Canonical retention has109 files/16,572,799 bytes. The generated167-path bundle
remains unaccepted and unadopted. Partial passes are observations at this source,
and are not carried into a later invocation.

The next candidate raises only the CLI's cumulative declared-source budget to
32MiB, preserving repeated-content accounting,2MiB per item/file, deadlines,
conflict checks and transaction cleanup. All110 identities, consumer/browser
cases and controller gates remain fixed. Publish a separate sibling source on
qa/mcpcn-form-workflows-20261108-attempt-3 before a complete new invocation.
Preserve both failed sources and originals. No local application, install,
build, test suite, server or browser ran below Storage Guard's reserve.
