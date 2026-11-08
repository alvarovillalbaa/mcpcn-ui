# MCPCN

Last updated: 2026-11-08

**MCP Component Network** is a React UI library for human-controlled agent workflows inside MCP Apps.

The source includes components, controlled workflow blocks, MCP Apps runtime
adapters, server helpers, a source registry, a CLI and a documentation app.
The current source has 12 primitives, sixteen specialized components and 40 named aliases
of the generic informational component. Eleven workflow blocks now contain
actual editing, selection, file-review, progress and approval compositions.

The eleven additional core components now have dedicated typed schemas,
controlled domain interactions and actual documentation previews. ApprovalCard
and SchemaForm also isolate replaced review/form payloads, preserve current
field ownership and handle asynchronous consumer feedback. The new
[v1 component packet](docs/results/2026/11-07/v1-components-checks.md) passed:
107 unit/installer cases, the docs build, both installed consumers and all
26 desktop/narrow Chromium cases, with verified owned cleanup. The exact
generated registry is included with its separately bound publication vector.
Keep this evidence separate from the historical packets below. The broader catalogue,
real-host playground, public npm release and quality matrix remain unfinished.

The [core v1 GitHub candidate](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-core.1)
contains the seven exact archives from the passing consumers. Their server
sizes and SHA256 digests match the [publication receipt](docs/results/2026/11-08/core-candidate-publication.json).
Package versions remain 0.1.0; this prerelease is separate from npm publication.

The [hosted v1 delivery](docs/results/2026/11-08/v1-public-delivery.md) passed
at exact source `42aec9dd7c712364d6c1b9021ef9eb188b5b91f0`: READY production
deployment and canonical alias, seven anonymous HTTP 200 responses, complete
JSON semantic parity and closed requests, responses and sockets. This hosting
evidence is separate from the local Chromium and installed-consumer packet.
Public npm, real MCP hosts, the iframe playground and broader quality gates
remain unfinished.

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
pnpm --filter @mcpcn/core build
pnpm --filter @mcpcn/schemas build
pnpm --filter @mcpcn/registry build
pnpm --filter mcpcn build
```

After building, `node packages/cli/dist/index.js --help` is the source CLI entry.
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
