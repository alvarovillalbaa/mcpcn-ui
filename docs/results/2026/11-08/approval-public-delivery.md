# Approval cohort — published source, archives and public delivery

8 November 2026 UTC. **Published and observed.** Accepted source
[`a526f29b90a056963eec2c8382942302f881959b`](https://github.com/alvarovillalbaa/mcpcn-ui/tree/a526f29b90a056963eec2c8382942302f881959b)
contains the five dedicated approval components and the verified generated
registry. Its [CI receipt](approval-checks.md) keeps the separate checked seed
`b67ee0819b4e07fcf3a177750079c9b459e57ab2`: 79 units/SSR, twelve browser cases
and two fresh consumers. No application implementation changed after that run.

Vercel deployment `dpl_DxWkAmZt36yvV3zuajKP69yJLEry` reached READY at
`12:59:30.925Z`; independent alias listing identifies
`https://mcpcn-ui.vercel.app`. Provider metadata and clone logs report accepted
source `a526f29b`. The [provider projection](approval-provider-projection.json)
keeps necessary fields and hashes of private account-specific originals.
Two bounded build windows contain 89 and 49 events, each below its 100-event
limit; all **138 build events** are [retained](approval-delivery-originals/build-events.json).
The initial broad response returned only 100 events, so it was not treated as
complete. Build logs report seven successful tasks, two cached, 82 pages and a
23-second build. The project is configured for Node 24.x; the provider log does
not independently identify an exact runtime patch version.

The [HTTP record](approval-public-delivery.json) passed **sixteen anonymous
canonical-origin GETs**, `13:03:15.087Z`–`13:03:19.922Z`, using native curl 8.7.1.
All returned HTTP/2 200, native exit zero, successful TLS verification and zero
redirects; 12,345,224 complete body bytes are retained losslessly alongside
headers and the original [native results](approval-delivery-originals/native-results.json).
There were no credentials, cookies, retries or permission-bypass/share links.

| Observation | Responses | Comparison |
| --- | ---: | --- |
| Five new component documentation pages | 5 | Each actual SSR form label and the consumer-response/intent/settlement controls |
| Checklist item and complete registry | 2 | Full JSON semantic equality to accepted source, including array order and all values |
| Playground wrapper | 1 | Actual host-simulator iframe and source attributes |
| Shared manifest and all its assets | 8 | Manifest byte equality and every asset length/SHA256 against passing CI |

The registry contains 79 unique identities: 21 specialized components, 35 generic
aliases, twelve primitives and eleven blocks. The 1,178-byte manifest has SHA256
`5fe103971aa0c3fb34adda6c59d9882603a858b4fce7cb0bbfa3bccfd287dc3d`.
All seven shared asset bodies total **708,063 bytes** and match CI exactly.
These comparisons cover this fixed route/artifact set. They do not operate a
hosted browser or independently prove provider source assignment. Unlike the
earlier instrumented HTTP packet, this native curl observation does not claim
raw request/response/socket lifecycle instrumentation.

The [public approval candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-approvals.1)
was published once at `13:02:42Z`, release438248819, with the tag at accepted
source `a526f29b`. Its [publication record](approval-candidate-publication.json)
verifies all seven unchanged passing CI archives, **300,095 bytes**, against
server sizes and SHA256 digests before and after publication. One interrupted
CLI upload left owned draft asset723951722 in `starter` state with a null digest.
After confirming and removing only that partial asset and observing its absence,
the same bytes uploaded once as asset723958664. The released set contains seven
fully uploaded assets. Internal package versions remain 0.1.0; earlier core and
playground tags/assets were untouched. No npm publication or new anonymous
archive installation is claimed.

One source-blob transport failure was also resolved through content readback:
nine peer blobs already existed, the missing image returned 404, and its exact
payload was uploaded once through the structured API. The largest registry blob
completed through its original native session; it was not blindly resubmitted.
Main advanced only after every native/API blob and the full tree agreed.

CI retained three prebuild-bin warnings; the provider build retained six such
warnings and the 537,532-byte chunk warning. Originals remain unchanged. The
temporary workflow was disabled and removed (API state `deleted`); the two original
broad workflow files remain unchanged. Only the owned approval QA branch was
retired. Source parsing, data decoding and anonymous HTTP reads ran locally;
there was no local application, dependency install, build, test suite or browser.

The thirty-five generic components, full-library quality matrix, public npm,
external MCP hosts, real authorization/tools/models, untrusted-HTML isolation,
physical devices and exhaustive accessibility remain unfinished. The four
non-priority apps are unaffected. Later documentation/cleanup commits preserve
all deployed application and generated registry inputs; the portfolio goal
remains active.

The [cleanup record](approval-cleanup.json) confirms removal of 621 verified
task copies / 124,183,235 bytes after ownership, identity, hash and native
no-opener checks. All 1,368 pre-existing source/evidence files were unchanged
during cleanup. Canonical originals, source, archives, raw provider records,
manifests and commit metadata remain retained. Final metadata publication uses
inline API bodies and creates no new filesystem transfer copies.
Raw HTTP headers retain their exact CRLF bytes and 294 whitespace diagnostics;
the separate handwritten source/docs whitespace check passes.
