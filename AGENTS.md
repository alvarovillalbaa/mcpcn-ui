# MCPCN source ownership

Last updated: 2026-11-04

- Product intent: the Notion `mcpcn-ui` React MCP Apps library brief. Preserve
  both package imports and editable source installation, a configurable docs
  site, runtime/server packages and the broader unfinished quality scope.
- Read source before editing. Use apply_patch, preserve unrelated work, and
  keep dependency, host protocol, Auth/security and CI changes separate.
- `packages/registry/src/installation.ts` owns validated installation options,
  commands, generated provider setup and configuration schema.
- `packages/registry/src/source-registry.ts` owns source payload construction.
  Tooling, registry CLI and docs routes consume its generated canonical data;
  never hand-edit generated registry JSON or replace failed fetches with stubs.
- Source-copy entries point to real copied local implementation and declared
  third-party dependencies. Existing generic component aliases are not bespoke
  implementations. Blocks must be real controlled React workflows.
- Consumer callbacks express intent. Do not automatically call tools, send
  context, upload files or change authorization from a workflow composition.
  Reuse the existing OfficialMCPAdapter for standard-mcp; do not select the
  legacy adapter or change host protocols in an installation repair.
- Preserve user files: preflight all registry payloads and destinations before
  writes, refuse conflicting/symlink paths, and record every installed file.
  Cleanup only files whose task ownership and current identity remain known.
- Current authority, 4 November 2026: the owner's repeated “I approve
  everything / Keep going / Do all the work” instructions authorize the first
  52 source-installation domain/CLI/SSR checks, seven required package builds
  and byte-identical canonical registry generation in one bounded public CI
  job. The [current proposal](docs/proposals/source-installation-checks.md)
  owns this scope. The first invocation built all seven packages and retained
  50 passing/two failing cases; its failed fixture-empty check is also retained.
  The next invocation repairs only callback-label lookup and tool-cache routing.
- Existing main-push broad CI and release jobs remain unchanged and unexecuted
  by this packet. Preparation and final main publication use `[skip ci]`.
  Only the exact-repository, exact-owned-branch `create` event may start the
  temporary focused workflow, which checks out an immutable preparation SHA.
  The repair branch is `qa/mcpcn-source-52-20261104-attempt-2`, never main.
  Retain the first attempt's branch as a retired bookmark at the repair source.
- After the terminal result, root retires only the temporary focused workflow
  on main with `[skip ci]` and guardedly fast-forwards the owned branch to that
  final source. Keep it as a retired bookmark; do not claim branch deletion or
  that the repository has no workflows. Broad CI/release definitions remain.
- The docs-app build, seven local package archives and two installed-consumer
  scenarios remain a subsequent unrun scope. Browser/real-host acceptance,
  package publication, account/Auth/provider changes and paid services are
  excluded from the first 52 checks. Preserve all historical receipts/seals.
- Canonical registry generation is an implementation step, separate from test
  execution. No local installation/build is part of this preparation. The CI
  packet installs the unchanged frozen lock with lifecycle scripts disabled;
  tracked generated registry bytes must remain unchanged. Local large work
  remains subject to Storage Guard and the supplied 30 GiB reserve.
- Record source, generated artifact, publication, package/hosted acceptance and
  pending checks separately under docs/. No new paid plan or provider account.
