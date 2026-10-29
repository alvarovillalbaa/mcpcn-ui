# MCPCN source ownership

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
- Source publication is authorized by the portfolio goal. Existing main-push
  CI and release jobs must stay unexecuted without their scoped approval; use
  the documented per-commit skip directive and report that limit honestly.
- New domain/CLI/SSR/browser checks require explicit scoped approval. No such
  new check scope has been approved for this repair. Prepare authored cases
  without running them. Targeted syntax/import/JSON/whitespace checks are fine.
- Canonical registry generation is an implementation step, separate from test
  execution. Do not install an environment to run it. Large installs/builds
  remain subject to Storage Guard and the supplied 30 GiB reserve.
- Record source, generated artifact, publication, package/hosted acceptance and
  pending checks separately under docs/. No new paid plan or provider account.
