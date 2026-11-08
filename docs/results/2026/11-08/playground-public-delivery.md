# Shared playground — public HTTP delivery

8 November 2026 UTC. **Passed: sixteen anonymous canonical-origin GET
observations**, recorded as two separate reports in
[run 42443829070](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42443829070),
job `128618472770`, on Node 24.22.2/Linux.
The immutable comparison source was
`6489c25dfa38b51076fab77eb8429ece3fc5239a`; the dispatched workflow commit was
`66197571e4f6a28babc7a117570a2d7ba529d5e7`.

The owner separately observed Vercel deployment
`dpl_G9CsFzCpiUv4vyWeVpN2vDyo1rQy` READY at `03:41:00.433Z` and the canonical
`https://mcpcn-ui.vercel.app` alias assigned at `03:41:00.571Z`. Those provider
source/alias observations are distinct from HTTP: the responses do not themselves
prove the supplied deployment ID or its source mapping. The separate
[publication projection](playground-public-delivery.json) preserves provider,
build and HTTP provenance.

| Retained observation | GETs | Complete body bytes | Accepted comparison |
| --- | ---: | ---: | --- |
| [Original seven routes](playground-public-delivery-originals/original-seven-routes.json) | 7 | 9,607,387 | Four HTML marker checks; three complete JSON semantic comparisons |
| [Shared playground artifact](playground-public-delivery-originals/playground-artifact.json) | 9 | 699,582 | SSR iframe marker, manifest and all seven passing-CI artifact bodies |
| Total | 16 | 10,306,969 | Separate helper verdicts; no browser execution |

The first report observed `/`, the confirmation-panel, dynamic-question-flow
and tool-call-card pages, `/schema/config.json`, `/r/comparison-matrix.json`
and `/r/registry.json`, at `03:42:29.571Z`–`03:42:33.062Z`. All three JSON
responses matched source semantics, including array order and every value.
The registry retained 16 specialized components, 40 generic aliases, 12 primitives
and 11 blocks. The HTML retained the pending-public-package notice and actual
component/demo/theme markers; this does not prove those controls were operated.

The second report observed `/playground`,
`/playground-simulator/asset-manifest.json` and every manifest file at
`03:42:33.113Z`–`03:42:34.656Z`. After removing script/style/comment contents,
the 10,220-byte SSR response contained the real simulator title and exact iframe
source. The 1,178-byte manifest matched the retained
[passing CI manifest](playground-asset-manifest.json), SHA256
`a29b16dcf30b458ccc11bd5a693c6ea0a31d934ff171cd40179ba3e796ea54bd`.
All seven HTML/JavaScript/CSS bodies matched their expected full lengths and
SHA256 values, **688,184 bytes** in total, with the expected content types.
This covers every file in that particular artifact, not every docs-site asset.

The [oracle](playground-asset-oracle.json) binds the original passing receipt
to CI source `caa5f6fbc62c7dabb36e9ed80d1e8698ebd5f0cb`, workflow
`f9587291a6f35defcd34a6c3da4fbd954ad9e590`, run `42442808721`/job
`128615434896`, and all four built/staged/installed artifact copies. Its 76 units,
twelve browser cases and two consumers are the earlier
[owned localhost CI acceptance](playground-checks.md), not additional tests or a
hosted-browser rerun. The two failed playground attempts remain unchanged.

All sixteen requests returned HTTP 200 with authorized TLS, complete bodies,
response end/close, request close and socket close before their absolute
deadlines. Both reports have empty errors and zero pending requests, responses
or sockets. There were no redirects, retries, request cookies, credentials,
authorization headers, provider/model calls or dependency installations. The
helpers reread their source/oracle inputs; the workflow guarded the exact clean comparison source
before and after both invocations.

The complete first report is 9,383 bytes, SHA256
`9732dc246ba62d74c40c29502184976ccd2fbf9f53f286c17f137453ab93dd30`;
the second is 8,415 bytes, SHA256
`8ea1c9ef1672faec884753d2d34b563bb86df759d287291c8755d1b67782fd73`.
They retain response lengths/hashes and terminal observations; full HTTP bodies
were held in CI memory and are not available for a new local body rehash.

This evidence does not establish hosted interaction/SDK negotiation, visual
rendering, exhaustive accessibility, physical devices, arbitrary-HTML isolation,
external MCP/tool/model behavior, public npm publication or future availability.
Later documentation/retirement commits and provider observations keep their
own source identities; this report does not preclaim their deployment.
