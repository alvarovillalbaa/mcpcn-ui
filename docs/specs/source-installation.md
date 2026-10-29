# Configurable source installation

Owning [Notion brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7):
a React library of reusable MCP Apps elements/components, installable through
npm/npx/pnpm, with a website and configurable installation inspired by shadcn.
The complete returned 29,152-character page was inspected on 29 October 2026.
Its unverified snapshot and last edit are 24 August 2026, 18:06:07.675Z. The long
research toggle is historical supporting material, not verified current host
protocol documentation or proof of the suggested product claims.

The full library/distribution/hosted objective remains open. This source change
repairs the installation path without replacing it with package stubs or block
metadata. It does not establish browser, host, production or npm acceptance.

## Owner boundaries

- `packages/registry/src/installation.ts`: configuration validation, dependency
  closure, commands, import snippets, provider source and persisted-file schema.
- `packages/registry/src/source-registry.ts`: canonical copied source payloads.
  Tooling, registry CLI and docs routes share its generated index/item objects.
- `packages/cli/src/installer.ts`: request/preflight, source ownership, per-file
  manifest, create-only writes and failure cleanup. The entry file only invokes
  this testable command runner.
- `packages/react/src/blocks.tsx`: eleven actual controlled React compositions,
  exported publicly through `@mcpcn/react/blocks`.
- `apps/docs/components/configurator.tsx`: real configuration/selection choices,
  shared generated instructions and five authored local previews.

## Configuration and output

The persisted configuration contains `$schema`, mode, style, host, TypeScript
profile, component directory, registry URL and package manager. Initialization
validates every supplied option before creating a new configuration. Existing
configuration is refused. Unknown/repeated flags, JavaScript output, unsafe
directories and unsupported URL forms fail visibly. Reserved dependency/build
folder names are checked without case sensitivity. The generated JSON schema
expresses field/shape restrictions; runtime URL parsing also checks valid URL
semantics. Old schema URLs and version-one single-file locks need explicit
review; they are not silently migrated or nested into the new manifest.

Copy mode places selected entry files and actual local core/schema/component/
runtime modules under the chosen directory, plus block implementation when
selected, styles, provider and MIT notice. Local entry reexports point to that
editable implementation. No `@mcpcn/*` runtime import remains in copied files.
The existing generic aliases remain generic aliases; installing source does
not turn them into bespoke components.

Source output uses the existing React/Zod/MCP SDK dependencies. The registry
declares React 19.2, Zod 4.4, ext-apps 1.7.5 and its MCP SDK 1.30.0 peer; the
dependency command assumes an existing TypeScript React app. No new repository
dependency or automatic consumer installation is introduced. Package mode emits
explicit package entry wrappers and provider setup, requiring the corresponding
published package release. That release currently does not exist on npm.

The generated provider creates a stable adapter in a client effect. `auto`
uses existing detection, `standard-mcp` uses `OfficialMCPAdapter`, and `openai`
uses the existing compatibility adapter. It applies the selected theme and
imports its actual styles. The preview stays local and does not connect to a
host when installation choices change. Existing runtime/server protocols,
permissions and package dependencies remain unchanged.

All block data and actions are consumer-controlled. Editing, comparisons,
selection, failed-step retry, named-tool consent, report review, file/extraction
ownership and bulk/admin impact have actual controls and explicit callbacks.
File selection never reads or uploads a file automatically. No block executes
a tool or persists business data. Consumers retain server authorization and
validation responsibility; these are UI intent surfaces.

## File ownership and failure behavior

The installer reads all required payloads and checks shared bytes, configuration,
prior ownership records and destinations before source writes. Canonical paths
are mapped into the configured component directory. Source files are create-only;
identical bytes can be reused, conflicting or modified files are preserved.
Every file's hash/source and each item's complete closure are recorded in the
version-two manifest. A project mutex serializes cooperating CLI operations.

The manifest is installed last. Before that publication boundary, cleanup is
limited to tracked inodes whose current bytes still match acknowledged owned
writes. Changed or unknown files are preserved and produce a finite cleanup
failure. After publication or uncertain publication, source/ownership evidence
is retained if final verification fails; the installer must not keep a marker
that refers to source it just rolled back. Temporary manifest cleanup is tracked
separately. Successful completion requires the command's zero exit and verified
manifest, not merely finding a JSON file after an interrupted/failed operation.

Keep the project and its ancestors unchanged while installing. Node pathname
checks and the cooperating mutex do not provide a filesystem snapshot or an
atomic sandbox against arbitrary concurrent ancestor replacement. The multi-file
operation is not one atomic transaction. Inspect retained evidence after failure
before retrying; never delete user files to make a retry succeed.

## Acceptance still required

The authored focused scope covers registry source closure, real workflow SSR/
callbacks, configuration/UI output and disposable installer behavior. Two
prepared CI consumers will additionally compile all copied entries and all
package-mode entries using built local tarballs. These checks remain unrun.

Fresh npm publication/installation, a hosted docs release, real-host protocol
acceptance, native browser interaction/accessibility, broader runtime/React/
framework matrices and the full library quality bar remain separate unfinished
work. The [check proposal](../proposals/source-installation-checks.md) requests
only its concrete runner scope. No account, paid plan or live business action
is required for that scope.

Primary format references: [shadcn registry item schema](https://ui.shadcn.com/docs/registry/registry-item-json)
for file/dependency payload structure, and [GitHub skip directives](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
for keeping unapproved main-push CI/release jobs unexecuted during source
publication. Existing workflows are preserved, not reported as passing.
