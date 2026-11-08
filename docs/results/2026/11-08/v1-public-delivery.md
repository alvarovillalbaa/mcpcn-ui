# V1 public documentation delivery

8 November 2026 UTC. **Passed**: the production deployment and canonical alias
were verified separately from seven anonymous HTTP observations.

The exact deployed and HTTP-comparison source is
`42aec9dd7c712364d6c1b9021ef9eb188b5b91f0`. The earlier
[source packet](../11-07/v1-components-checks.md) retains its own 107 unit,
26 Chromium and two installed-consumer results, source and four failed attempts.
Those checks were not rerun by this HTTP packet.

## Deployment and build

Provider metadata records production deployment
`dpl_DsDWTQn3nJJcNZ28m8ivLbgnB8AH` at
[`mcpcn-c2a0ou7r3-my-team-4f230354.vercel.app`](https://mcpcn-c2a0ou7r3-my-team-4f230354.vercel.app).
Its READY timestamp is `1794103034341`; a separate canonical-alias read maps
[`mcpcn-ui.vercel.app`](https://mcpcn-ui.vercel.app) to that same deployment,
updated at `1794103034473`. HTTP alone does not establish this source/alias
mapping.

The actual production build used Node 24.22.2, pnpm 10.24.0 and Next 16.3.0.
All six Turbo tasks ran without cache hits. Generation produced 79 registry
entries, and the docs build produced 82 pages with `/r/registry.json` static.
Two prebuild workspace-bin `ENOENT` warnings are retained; their owning
packages subsequently built successfully. The successful result does not
erase those warnings.

The complete provider build-event sequence was recovered through four bounded,
nontruncated windows: [one](v1-public-delivery-originals/build-events-1.json),
[two](v1-public-delivery-originals/build-events-2.json),
[three](v1-public-delivery-originals/build-events-3.json) and
[four](v1-public-delivery-originals/build-events-4.json). Their 115 returned rows
contain 109 unique JSON events; reported overlaps remain intact. The initial
truncated response is not treated as a complete log. Original project, deployment and
alias metadata are linked by the [publication record](v1-public-delivery.json)
and [original manifest](v1-public-delivery-originals/manifest.json). The older
[candidate publication](core-candidate-publication.json) preserves its
as-observed hosting status; this receipt records the later outcome.

## Seven anonymous HTTP observations

[Run 42436541743](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42436541743),
job `128596492891`, checked the source above. Its workflow commit is separately
`e102fbc3ecffb66a9292d54f9935fab1ef498cb7`.

All seven sequential canonical-origin GETs returned HTTP 200 between
`01:59:02.551Z` and `01:59:05.269Z`, receiving 9,134,427 body bytes in total.
Every observation used authorized TLS 1.3 and completed its body, response,
request and socket before its deadline. No error, authorization header,
cookie, redirect or retry was accepted.

| Path | Actual accepted observation |
| --- | --- |
| `/` | Homepage title, pending-package notice and counts: 68 catalogue entries, eleven blocks, five examples and two installation modes. |
| `/components/confirmation-panel` | Domain component, schema/events sections, authored confirmation fixture and initial theme control. |
| `/components/dynamic-question-flow` | Domain component, schema/events sections, authored question fixture and initial theme control. |
| `/components/tool-call-card` | Domain component, schema/events sections, authored inspection fixture and initial theme control. |
| `/schema/config.json` | Complete JSON semantic equality with the checked config schema. |
| `/r/comparison-matrix.json` | Complete JSON semantic equality with the checked specialized item and its data schema. |
| `/r/registry.json` | Complete JSON semantic equality with all 79 checked items: sixteen specialized, forty generic aliases, twelve primitives and eleven blocks. |

The registry response was 8,910,003 bytes, SHA256
`3f33d8e9f906eb3d25f017738bdd340d02e29334b9c78d0320d99dbb5f77860e`.
JSON acceptance preserves array order and every finite value while ignoring
object-key order and serialization formatting; it is not a claim that pretty
source JSON and HTTP bytes are identical. HTML checks inspect SSR markers,
excluding script/style contents, rather than browser interaction or rendering.

The [original one-line report](v1-public-delivery-originals/report.json) is
9,378 bytes, SHA256
`79daa9eeef1aa303504fd107852a4b54088642c13c50905cd7f1ed7846090d7f`.
The [retained decoded job log](v1-public-delivery-originals/job.log) is 29,203
UTF-8 bytes, SHA256
`7bd860b13bad1a9a4a286d2ba0479ee5be3b46ec6a9c82080b82f29ae6f9d249`.
Full HTTP bodies were validated in memory and are not retained for local replay;
the originals preserve their lengths, hashes, comparisons and terminal metadata.
The full publication whitespace check reports seven timestamp-only log lines
with trailing spaces. Those original bytes remain unchanged; they are not
source or documentation whitespace fixes.

The [reviewed protocol](../../../proposals/v1-public-delivery.md) bounds each
request and validation to fifteen seconds, all observations/closure to ninety
seconds and the read-only public Ubuntu job to three minutes. HTML is capped
at 1 MiB, JSON at 16 MiB and cumulative body bytes at 24 MiB. Source files were
checked before and after the observations. Workflow `410811864` was disabled
after the pass; this evidence edition removes its active file. The two broad
CI/release workflows remain unchanged.

## Remaining acceptance

This result establishes the named source deployment and these seven HTTP/SSR
observations. It does not establish public npm publication, real MCP-host or
iframe-playground compatibility, untrusted-HTML isolation, all-assets integrity,
physical-device behavior or full accessibility conformance. The forty generic
aliases and broader library/example work remain unfinished. No account,
protection policy, provider configuration, paid service, model call or live
business data was changed by the HTTP observations.
