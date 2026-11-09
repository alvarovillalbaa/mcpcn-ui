# MCPCN

Last updated: 2026-11-08

**MCP Component Network** is a React UI library for human-controlled agent workflows inside MCP Apps.

The source includes components, controlled workflow blocks, MCP Apps runtime
adapters, server helpers, a source registry, a CLI and a documentation app.
The current source has 12 primitives, 35 specialized components and 21 named aliases
of the generic informational component. Eleven workflow blocks now contain
actual editing, selection, file-review, progress and approval compositions.

SourceList and EvidenceDrawer now have dedicated strict source for current
source selection and complete supplied text/JSON inspection. The native drawer
owns immediate dismissal and fences obsolete notification feedback. The
[evidence contract](docs/specs/evidence-review-components.md) separates supplied
claims, identity-only intents and model-private content. Its
[focused acceptance](docs/results/2026/11-08/evidence-review-checks.md) passed
90 new unit/SSR cases, twelve desktop/narrow browser scenarios and two fresh
strict consumers at `f6149dde73a81c9d0cd74206ca10b1226b093d4f`. Four real
keyboard-reading proofs verify complete supplied text/JSON. All167 generated
paths were verified and159 changed files adopted. Earlier failed invocations
and the fourth scoped pass remain preserved. Package publication and hosted
delivery are separate boundaries.

DocumentPreview and FileReview now have dedicated source for full supplied text,
JSON and paginated raster/text inspection, caller-controlled corrections and
explicit scoped save intent. The [file review contract](docs/specs/file-review-components.md)
keeps file reading, conversion, extraction and persistence in the consuming app.
The [focused file-review receipt](docs/results/2026/11-08/file-review-checks.md)
passed 85 new unit/SSR cases, 12 desktop/narrow browser scenarios and 2 fresh strict
consumers at `7fbde9bb1181a1587b0a3655d60f64775a65113a`, plus 12 separately declared
shared ownership fixtures. All 167 generated paths were verified; 159 changed
files were adopted. Both earlier failures remain preserved. The
[seven-archive candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-file-review.1)
is published at source `6b008cded663f9dc746cb6dfa099018018d47501`; all server
digests match those passing archives. The [first hosting attempt](docs/results/2026/11-08/file-review-hosting-attempt-1.md)
failed because the complete aggregate registry exceeds Vercel's ISR limit.
A separate [static registry repair](docs/specs/static-registry-hosting.md)
preserves every registry byte and the package release's source identity.
Its [focused hosting CI](docs/results/2026/11-08/static-registry-hosting-checks.md)
passed at `3007041275df2a87bef9f3070a90b19b0a6ace42`: eight staging cases,
12 unchanged ownership fixtures, actual81-page docs build, same-key cache
restoration and six complete production HTTP checks. All167 generated outputs
and797,096 simulator asset bytes stayed unchanged. All five failed hosting CI
invocations remain preserved. The [public delivery](docs/results/2026/11-08/file-review-public-delivery.md)
binds accepted source `1da616761feb6da12dda63b87e0369c5327866d0` to READY,
the canonical alias and14 anonymous HTTP200/TLS observations. The complete
registry and all seven simulator assets match; package release source stays6b.

The five remaining forms now have dedicated source: MissingDataRequest,
MultiStepForm, InlineEditForm, FormProgressCard and ValidatedFieldList. Their
[contract](docs/specs/form-workflow-components.md) covers typed missing values,
controlled steps, structured JSON editing, explicit set/clear changes and
reported progress/validation. The [focused CI receipt](docs/results/2026/11-08/form-workflow-checks.md)
passed110 new unit/SSR cases, twelve desktop/narrow browser scenarios and both
fresh strict consumers, including actual SSR of installed editable source, at
`3b0b203225cf41aa2cd339afb977f24182991a22`. Twelve separate process-ownership
fixtures and full source/stream/cleanup gates also passed. All167 generated
paths were verified;159 changed files were adopted. Five failed invocations
and their original evidence remain preserved in the receipt. CI acceptance
and hosted delivery are separate proof boundaries.
The [public delivery](docs/results/2026/11-08/form-workflow-public-delivery.md)
records READY source `382fb0fc`, sixteen anonymous HTTP200/TLS observations,
exact registry semantics and every simulator asset. The
[candidate prerelease](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-forms.1)
contains all seven unchanged passing archives with verified server digests.

The five remaining tool-execution aliases now have dedicated source for outcomes,
reported progress, partial results, ordered steps and filtered trace events.
Their [contract](docs/specs/tool-workflow-components.md) and
[focused CI receipt](docs/results/2026/11-08/tool-workflow-checks.md) record
91 passing unit/SSR cases, twelve desktop/narrow browser scenarios and two fresh
installed consumers at `ad288e1f63814211d061e7258ea330b1048fa30a`.
All 167 generated paths were verified and adopted from that passing packet.
The [first run](docs/results/2026/11-08/tool-workflow-attempt-1.md) remains failed
at 90/91 after a getter-safety failure; its consumers/browser were not reached.
The separate [public delivery](docs/results/2026/11-08/tool-workflow-public-delivery.md)
records READY production source `c33e8a13`, sixteen anonymous delivery responses
and the [seven-archive candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-tool-workflows.1).
Public npm, external hosts and hosted interaction remain separate.

Five additional approval components now have dedicated source implementations:
ApprovalChecklist, BeforeSubmitConfirmation, DestructiveActionGuard,
HumanOverridePanel and PermissionRequestCard. Their [typed contract](docs/specs/approval-components.md)
and [focused acceptance receipt](docs/results/2026/11-08/approval-checks.md)
passed 79 new unit/SSR cases, twelve desktop/narrow browser scenarios and both
fresh installed consumers at `b67ee0819b4e07fcf3a177750079c9b459e57ab2`.
All 167 generated paths were verified; 159 changed outputs were adopted from
that passing packet. Existing v1/playground receipts and public archives below
retain their earlier sixteen-component source boundaries. The
[approval candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-approvals.1)
publishes the seven unchanged passing archives; the
[delivery receipt](docs/results/2026/11-08/approval-public-delivery.md) records
the READY production deployment and sixteen successful anonymous HTTP checks.
The [publication record](docs/results/2026/11-08/approval-candidate-publication.json)
binds server digests to those archives. Package versions remain 0.1.0; public
npm and hosted browser interactions remain separate, unverified boundaries.

The earlier v1 completion added eleven core components with dedicated typed schemas,
controlled domain interactions and actual documentation previews. ApprovalCard
and SchemaForm also isolate replaced review/form payloads, preserve current
field ownership and handle asynchronous consumer feedback. The new
[v1 component packet](docs/results/2026/11-07/v1-components-checks.md) passed:
107 unit/installer cases, the docs build, both installed consumers and all
26 desktop/narrow Chromium cases, with verified owned cleanup. The exact
generated registry is included with its separately bound publication vector.
This v1 packet predates the shared playground below and keeps its own source
and acceptance boundary. The broader catalogue, external MCP-host compatibility,
public npm release and quality matrix remain unfinished.

The [core v1 GitHub candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-core.1)
contains the seven exact archives from the passing consumers. Their server
sizes and SHA256 digests match the [publication receipt](docs/results/2026/11-08/core-candidate-publication.json).
Package versions remain 0.1.0; this prerelease is separate from npm publication.
It predates the shared-playground artifact and does not establish that later
CLI service's acceptance.

The [hosted v1 delivery](docs/results/2026/11-08/v1-public-delivery.md) passed
at exact source `42aec9dd7c712364d6c1b9021ef9eb188b5b91f0`: READY production
deployment and canonical alias, seven anonymous HTTP 200 responses, complete
JSON semantic parity and closed requests, responses and sockets. This hosting
evidence is separate from the local Chromium and installed-consumer packet.
This earlier HTTP receipt retains its original source and scope. Public npm,
external MCP hosts and broader quality gates remain unfinished.

The [shared iframe playground](https://mcpcn-ui.vercel.app/playground) now serves
the same manifest-bound simulator as the source-built and installed CLI. Its
[third CI packet](docs/results/2026/11-08/playground-checks.md) passed all
76 focused units, twelve desktop/narrow browser cases and both fresh installed
consumers at `caa5f6fbc62c7dabb36e9ed80d1e8698ebd5f0cb`, with owned cleanup.
The separate [public-delivery packet](docs/results/2026/11-08/playground-public-delivery.md)
passed sixteen anonymous HTTP GET observations at comparison source
`6489c25dfa38b51076fab77eb8429ece3fc5239a`: the original seven routes, plus the
SSR wrapper, manifest and all seven shared artifact files. These HTTP checks
did not run a hosted browser. The [playground contract](docs/specs/iframe-playground.md)
keeps the authored fixture host, trusted built-in frames and external-host/
untrusted-HTML boundaries explicit; both failed playground attempts remain retained.

The [playground GitHub candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-playground.1)
supplies all seven unchanged archives from that passing packet, including the
bundled CLI simulator. Server sizes and SHA256 digests match the
[publication receipt](docs/results/2026/11-08/playground-candidate-publication.json).
Internal package versions remain 0.1.0; the GitHub prerelease tag is separate
from public npm publication. The earlier core candidate remains available.

**Public package availability remains unverified.** Registry lookups for
`mcpcn` and `@mcpcn/react` returned npm E404 on 29 October 2026; the commands
below describe the intended release, not a newly verified registry result.
The [historical delivery receipt](docs/results/2026/10-29/source-installation.md)
records a protected staging docs build at `9dcb1ee0` that reached READY. Its
unauthenticated request redirected to SSO; page rendering, installed consumers
and live-host acceptance were not established. That old hosting result is
separate from the completed focused checks and provides no new hosted proof.

```bash
pnpm add @mcpcn/react @mcpcn/runtime @mcpcn/schemas
# or own the source
pnpm dlx mcpcn init
pnpm dlx mcpcn add approval-card tool-progress-timeline
```

## Principles

- External state changes deserve a review surface.
- Recommendations include evidence.
- Destructive actions show impact and require explicit consent.
- Structured tool output is validated before rendering.
- Model-visible and private UI state are declared separately.
- Components degrade safely when a host capability is absent.

## Workspace

- `apps/docs` — documentation, gallery, configurator, and registry endpoint
- `apps/playground` — local MCP Apps bridge simulator
- `packages/react` — accessible React components
- `packages/runtime` — standard MCP Apps host abstraction
- `packages/schemas` — Zod and JSON Schema contracts
- `packages/server` — MCP tool/resource registration helpers
- `packages/registry` — catalog and shadcn-compatible registry builder
- `packages/cli` — `mcpcn` CLI

The [installation contract](docs/specs/source-installation.md) explains copy
ownership, configuration, declared consumer dependencies and proof boundaries.
The configurator and CLI share the same host/theme/selection contract. Source
copy includes actual editable local modules, styles and the MIT notice rather
than reexports from an MCPCN package. The provider selects the existing official
MCP Apps adapter or OpenAI compatibility adapter without changing their protocol.

For source development, use the existing lockfile and an environment with enough
storage. The historical receipt records a failed local Storage Guard preflight;
the completed CI packet performed no local installation or build:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=mcpcn...
```

The CLI's workspace dependency graph includes the private playground. Turbo's
`^build` ordering builds its required packages and the two-page Vite artifact
before the CLI stages that artifact into `dist/playground`; building only the
old core/schema/registry sequence omits these prerequisites.

After building, `node packages/cli/dist/index.js --help` is the source CLI entry.
Choose a source-built service command:

```sh
node packages/cli/dist/index.js dev --port=4545
# Or start with a selected component or block:
node packages/cli/dist/index.js preview approval-card --port=4546
```

If an archive built from this shared-playground source is already installed in
an app, its local binary supports the same commands:

```sh
./node_modules/.bin/mcpcn dev --port=4545
./node_modules/.bin/mcpcn preview approval-card --port=4546
```

Both commands bind only `127.0.0.1` (4545 by default), serve reviewed bundled
fixtures and stay running until stopped. They do not open a browser, serve the
working directory or connect an external tool/model. Public npm availability
is still unverified; the installed example assumes an existing reviewed archive.

To use it in another existing TypeScript React app, keep the built CLI's absolute
path in a shell variable, change into that app, and run its `init`/`add` commands.
The generated configuration defaults to this repository's public source registry.
JavaScript output is explicitly rejected; it is not silently replaced with TSX.
The CLI reports dependency commands and never runs a package manager for you.

The [focused check proposal](docs/proposals/source-installation-checks.md)
records **52/52 checks passed** on 4 November 2026:
12 registry, 16 installer, 12 workflow-block and 12 configurator cases. One
public Ubuntu job used Node 24.21.0/pnpm 10.24.0, the unchanged frozen lock with
scripts disabled, seven required package builds and byte-identical registry
generation. The [first run](docs/results/2026/11-04/source-installation-52-attempt-1.md)
built all seven packages and regenerated all 79 entries unchanged, then reported
50 passing/two failing callback cases and a nonempty fixture directory. Its
failure is preserved. The [second run](docs/results/2026/11-04/source-installation-52-checks.md)
checked the test-only label lookup and owned compiler-cache routing repair at
`574c87eb57db8cec82eec8319efa875b7299433c`: all 52 identities/statuses, seven
package builds, generation, full source guards and owned cleanup passed.
The old protected staging build remains a separate observation. The status
edition at `50034ca41471a5eadca076c02cb556047d2d7a27` changed three of the
313 checked inputs; its other 310 were unchanged. Subsequent consumer work uses
a separate source seal and does not replace that reproduction target.

The job uses only the exact owned branch's `create` event and an immutable source
pin. Main preparation/final commits use `[skip ci]`; the existing broad CI and
release jobs stayed unchanged and unexecuted by that packet. Its temporary
workflow is removed and both owned branches are retained as retired bookmarks.

The [consumer packet](docs/proposals/consumer-checks.md)
[passed](docs/results/2026/11-04/consumer-checks.md) at
`eca3d6a031019cc142cfd3ab01f38c9365ce02c6`: the docs production build, seven
local package archives and both installed consumers. Each consumer installed
all 79 entries and compiled with its own TypeScript 5.9.3. Package mode used the
actual installed CLI launcher and verified all 24 declared JS/type/CSS/bin
targets plus the two packaged style assets. Two separate lifecycle controls
also passed; source guards and owned cleanup passed throughout. The consumer
status edition at `6d9cc119eb060279793733d3fb6491eea0569218` changed six of
the 316 checked inputs; its other 310 were unchanged. Reproduce the immutable
source above for that result. Later hosting work uses a separate source pin.

The consumer workflow is removed and its branch is a retired bookmark at
`6d9cc119`; the two old 52-check bookmarks stay at `50034ca`.
Browser/real-host acceptance, public npm release and hosted docs delivery remain
separate work; this local CI build establishes no new hosting or page proof.

The historical [4 November delivery](docs/results/2026/11-04/public-delivery.md)
recorded the public documentation site at
`435af4b7c523bd8013d25e852c1be81dfe9893b3`: five anonymous HTTP 200 checks for
the homepage, docs, config schema, button payload and complete 79-entry registry.
Both HTML pages contained the corrected security link and release-status copy;
all three JSON responses matched that pinned source. Its production docs build
passed on Node 24.22.2, with six Turbo tasks and 81 static pages; five dependency
tasks reused cache. That temporary HTTP workflow was removed and its branch
retired. Those observations remain scoped to the older source; the current
[public documentation site](https://mcpcn-ui.vercel.app) and its seven-route
v1 delivery are recorded in the newer receipt above. Neither HTTP packet proves
live MCP-host compatibility or public npm publication.

## Security

MCPCN never assumes that UI state is model-visible. Every workflow component publishes a security manifest describing model-visible fields, private fields, tools called, and whether the action is destructive. Applications remain responsible for authorization and server-side validation.

MIT licensed.
