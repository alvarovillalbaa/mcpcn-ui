# MCPCN

Last updated: 2026-11-04

**MCP Component Network** is a React UI library for human-controlled agent workflows inside MCP Apps.

The source includes components, controlled workflow blocks, MCP Apps runtime
adapters, server helpers, a source registry, a CLI and a documentation app.
The catalog has 12 primitives, five specialized components and 51 named aliases
of the generic informational component. Eleven workflow blocks now contain
actual editing, selection, file-review, progress and approval compositions.

**Public package availability remains unverified.** Registry lookups for
`mcpcn` and `@mcpcn/react` returned npm E404 on 29 October 2026; the commands
below describe the intended release, not a newly verified registry result.
The [historical delivery receipt](docs/results/2026/10-29/source-installation.md)
records a protected staging docs build at `9dcb1ee0` that reached READY. Its
unauthenticated request redirected to SSO; page rendering, installed consumers
and live-host acceptance were not established. That old hosting result is
separate from the upcoming focused checks and provides no new hosted proof.

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
this preparation performs no local installation or build:

```sh
pnpm install --frozen-lockfile
pnpm --filter @mcpcn/core build
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
now records the owner's standing authorization for the first **52 checks**:
12 registry, 16 installer, 12 workflow-block and 12 configurator cases. One
public Ubuntu job uses Node 24.21.0/pnpm 10.24.0, the unchanged frozen lock with
scripts disabled, seven required package builds and byte-identical registry
generation. Execution remains unrun; preparation, source publication and the
old protected staging build are separate observations.

The job uses only the exact owned branch's `create` event and an immutable source
pin. Main preparation/final commits use `[skip ci]`; the existing broad CI and
release jobs stay unchanged and unexecuted by this packet. Afterward the
temporary focused workflow is retired and its branch retained as a bookmark.
The docs build, seven local archives and two installed-consumer scenarios remain
subsequent and unrun. Browser/real-host acceptance, public package release,
accounts and provider/model calls are outside the first 52-case packet.

## Security

MCPCN never assumes that UI state is model-visible. Every workflow component publishes a security manifest describing model-visible fields, private fields, tools called, and whether the action is destructive. Applications remain responsible for authorization and server-side validation.

MIT licensed.
