# Evidence review: first invocation failed

Checked source: `057ff730b9aaf1b997942cb8fe9ec430918eac3c`, direct child of
`8a9cd4bb70502894a5e31851e03c5651c4d7b75b`. Workflow source:
`bb159df9e313d0cbe2297ea10dee295cae568e76`.
[Run42534037559](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42534037559),
job128894266645, completed with `docs_production_build_failed`.

All90 new unit/SSR cases and12 separately declared unchanged ownership fixtures
passed. Seven package builds, playground typecheck/build, all167 generated-path
checks and deterministic regeneration passed. The docs production bundle compiled,
then TypeScript rejected two deliberately malformed demo props (TS2352 at
source-evidence-demos.tsx:86 and136). They added an unsupported field and cast
directly to the strict state unions; an explicit intermediate unknown is needed
at those two negative-fixture boundaries. Normal typed data and schema validation
do not change.

Docs acceptance, both fresh consumers and all12 browser cases were not reached.
Generated output remains unadopted and untested as a complete packet. The returned
167-file bundle is73056318 bytes, SHA
`d4d5f7552f1aad250727e42b2d5c246534f384fd1fd656330cd1222d197edadc`;
its14600855-byte gzip is preserved as failed evidence.

All four source guards actually reached passed against3322 paths, and all six
reached export guards passed. Owned cleanup passed: no remaining processes,
scratch root removed, one freshly rechecked vanished identity, zero stable unknown
ownership or failed identity rechecks. Partial counts remain partial.

The [exact originals](evidence-review-attempt-1-originals/receipt.json) include
the raw unit/command streams, source vector and generated transport. Independent
decoding and retention preserved85 files/18665051 bytes; retention SHA-256
`6ee85c85b1636b2d2225e77830252ce23fa7292bbeac039918ba09edf4c5d522`.
The complete private provider log is20955643 UTF-8 bytes, SHA-256
`2cdc1ae62673b3ebaf6c96756764cf929f2ab5b65b95fb0d90abb9f9124653e3`.

A separate second candidate may correct only the two fixture casts plus this
evidence/provenance. Keep the same90/12/2 scope, budgets, supervisor and main
workflow. Preserve the failed candidate/ref and originals; publish the new source
on `qa/mcpcn-evidence-review-20261108-attempt-2`, again directly after BASE.
