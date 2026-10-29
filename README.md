# MCPCN

**MCP Component Network** is a React UI library for human-controlled agent workflows inside MCP Apps.

The source includes components, controlled workflow blocks, MCP Apps runtime
adapters, server helpers, a source registry, a CLI and a documentation app.
The catalog has 12 primitives, five specialized components and 51 named aliases
of the generic informational component. Eleven workflow blocks now contain
actual editing, selection, file-review, progress and approval compositions.

**Package release pending.** Registry lookups for `mcpcn` and `@mcpcn/react`
returned npm E404 on 29 October 2026. The commands below describe the intended
release; npm availability, installed-consumer checks and live-host acceptance
are not established. No hosted documentation deployment was identified in the
connected Vercel scopes. Source and proof limits are recorded in the
[delivery receipt](docs/results/2026/10-29/source-installation.md).

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
storage. This session's Storage Guard failed, so these installation/build commands
have not been run locally:

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
contains the exact new scope. The existing broad `pnpm check` and main-push CI/
release workflows remain separate; source publication is not passing CI or an
npm release.

## Security

MCPCN never assumes that UI state is model-visible. Every workflow component publishes a security manifest describing model-visible fields, private fields, tools called, and whether the action is destructive. Applications remain responsible for authorization and server-side validation.

MIT licensed.
