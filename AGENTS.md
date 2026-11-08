# MCPCN source ownership

Last updated: 2026-11-08

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
  owns this scope. The [second invocation](docs/results/2026/11-04/source-installation-52-checks.md)
  passed all 52 cases at immutable source
  `574c87eb57db8cec82eec8319efa875b7299433c`, with seven package builds,
  byte-identical generation and all source/process/cleanup gates passing.
  Preserve the first invocation's 50 passing/two failing cases and failed
  fixture-empty check; the repair changed only test-label lookup/cache routing.
- Existing main-push broad CI and release jobs remain unchanged and unexecuted
  by this packet. Preparation and final main publication use `[skip ci]`.
  Only the exact-repository, exact-owned-branch `create` event may start the
  temporary focused workflow, which checks out an immutable preparation SHA.
  The two owned branches are `qa/mcpcn-source-52-20261104` and
  `qa/mcpcn-source-52-20261104-attempt-2`, never main.
- The first packet's temporary workflow was removed at
  `50034ca41471a5eadca076c02cb556047d2d7a27`; both owned check branches point
  there as retired bookmarks. Broad CI/release definitions remain unchanged.
- Current consumer packet: standing owner authorization covers repairing the
  prepared harness's process lifecycle, focused owned lifecycle regressions,
  the docs-app build, seven local package archives and both installed-consumer
  scenarios, in one public Ubuntu/Node 24.21/pnpm 10.24 job capped at 20 minutes.
  Use the [consumer scope](docs/proposals/consumer-checks.md), a complete new
  source seal and immutable checkout. Only the exact owned branch's `create`
  event (`qa/mcpcn-consumers-20261104`) may run the temporary workflow; all main
  publication commits retain `[skip ci]`. Keep the old two bookmarks unchanged.
  The [actual result](docs/results/2026/11-04/consumer-checks.md) passed at
  `eca3d6a031019cc142cfd3ab01f38c9365ce02c6`: docs build, seven local archives,
  both 79-item consumers and two separate lifecycle controls, with source and
  owned cleanup gates passing. Preserve failures and historical source pins.
  Its temporary workflow is removed and its owned branch points to final source
  `6d9cc119eb060279793733d3fb6491eea0569218`; leave the old two bookmarks at
  `50034ca` unchanged.
- Browser/real-host acceptance,
  package publication, account/Auth/provider changes and paid services are
  outside this consumer packet. Preserve all historical receipts/seals.
- The portfolio goal also authorizes the separate
  [hosting release](docs/proposals/hosting-release.md): fix the missing security
  link and unsupported readiness copy, build an exact reviewed Git SHA in the
  existing Vercel project, inspect it and promote through the existing verified
  production domain. Preserve SSO/domain policy and all check receipts. Record
  build-setting overrides and actual hosting evidence separately from CI.
- The [public delivery receipt](docs/results/2026/11-04/public-delivery.md)
  records production source `435af4b7c523bd8013d25e852c1be81dfe9893b3`, READY
  canonical-domain assignment and five anonymous HTTP 200 checks. Three JSON
  endpoints match that source, including all 79 registry entries; the two HTML
  responses contain corrected security/release markers. The actual docs build
  ran Node 24.22.2, six Turbo tasks/81 pages with five dependency cache hits.
  This evidence edition retires the temporary HTTP workflow and only its own
  `qa/mcpcn-public-http-20261104` bookmark; keep all older receipts/bookmarks.
  Public npm ownership/release, browser interaction and live-host acceptance
  remain pending. HTTP success does not establish those boundaries.
- Canonical registry generation is an implementation step, separate from test
  execution. This packet performed no local installation/build. The CI packet
  installed the unchanged frozen lock with lifecycle scripts disabled and
  verified tracked generated registry bytes unchanged. Local large work
  remains subject to Storage Guard and the supplied 30 GiB reserve.
- Record source, generated artifact, publication, package/hosted acceptance and
  pending checks separately under docs/. No new paid plan or provider account.

## Sixteen-component v1 completion — 7 November 2026

The owner's standing instruction to do all development and checks authorizes
replacing the eleven v1 generic aliases with real typed components, schemas,
controlled previews and copyable modules. Preserve the remaining forty alias
identities and their honest status. Consent/form replacement fixes belong to
this scope; external MCP protocols, provider accounts and authorization do not.
The two new workspace edges are registry → schemas for canonical metadata and
docs → schemas for the previews' public data types. No external application
dependency changes.

Use the [v1 packet](docs/proposals/v1-components-checks.md): new focused tests,
the seventeen relevant installer regressions, twenty-six authored desktop/
narrow Chromium cases and two installed-consumer profiles. The historical
52-case, consumer and HTTP packets keep their original identities and limits.
No local build/install/browser is authorized below Storage Guard's reserve.

Prepare source on the exact owned branch
`qa/mcpcn-v1-components-20261107`. One temporary public Ubuntu workflow accepts
an immutable `source_sha` through manual dispatch on main, with a read-only
token and twenty-minute cap. Main preparation changes only that workflow and
retains `[skip ci]`; existing broad CI/release definitions and all older owned
bookmarks remain unchanged. Keep workflow commit and checked source distinct.

Generate the canonical registry only through its owner in external owned
storage. Generation intentionally changes its 160 JSON outputs and seven
package licenses in the export; every other source byte/mode must stay fixed.
Verify deterministic regeneration, actual copied fourteen-module closure and
all 79 item/index identities. Retain exact generated bytes and their vector,
then publish only that verified artifact set with the reviewed source. Do not
hand-edit registry JSON or call stale generated output the tested source.
Retain complete bounded evidence, failed originals and owned teardown. Retire
the temporary workflow after terminal acceptance. No npm publication, login,
new account, model call or paid service belongs to this packet.

The [fifth source packet](docs/results/2026/11-07/v1-components-checks.md) passed
at `a8bd783fc41cdd8eebd1a6eac9944ca96085f1fe`: 107 exact unit/installer cases,
26 browser cases and both strict installed consumers, five source guards and
complete owned cleanup. Preserve all four failed invocations. The exact
generated profile is adopted with its [publication vector](docs/results/2026/11-07/v1-generated-publication.json),
distinct from seed Git bytes. Workflow `410720792` is disabled and removed in
this evidence edition. Existing broad CI/release jobs remain unchanged.
The [8 November public delivery](docs/results/2026/11-08/v1-public-delivery.md)
records READY production source
`42aec9dd7c712364d6c1b9021ef9eb188b5b91f0`, its canonical alias and seven
anonymous TLS GET responses with complete body/request/response/socket closure.
All three JSON responses match that source semantically. Workflow `410811864`
was disabled after acceptance and is removed in this evidence edition; the two
broad workflows remain unchanged. Provider source/alias metadata and HTTP
observations retain separate provenance. Those HTTP observations alone do not
establish public npm, real MCP hosts, the iframe playground, untrusted-HTML
isolation, all-assets integrity, physical devices or full accessibility.

## Shared iframe playground — 8 November 2026

The owner's standing “Keep going / Do all the work” instruction authorizes the
next [shared playground scope](docs/specs/iframe-playground.md): actual official
SDK host/app documents, negotiated runtime lifecycle and the packaged loopback
`dev`/`preview` service. Preserve public method signatures, the fourteen copied
source modules and all historical evidence. Dependency edits declare existing
locked SDK/workspace edges and the existing-catalog React DOM test dependency;
no external version upgrade is intended. Preserve the
[first failed invocation](docs/results/2026/11-08/playground-attempt-1.md):
47 collected passes, 29 adapter cases uncollected because the SSR test's direct
React DOM dependency was undeclared. Do not waive its strict 76-case gate.

The [second failed invocation](docs/results/2026/11-08/playground-attempt-2.md)
passed all 76 units and both consumers, but only seven of twelve browser cases.
Retain its four stable unreadable process identities and unremoved scratch as
failed cleanup. Trusted form-event permission, exact polling/observer repairs
and independent fresh nonce-anchor sampling must keep unknown ownership fatal;
neither source repair changes this historical result into a pass.

The [third invocation](docs/results/2026/11-08/playground-checks.md) passed at
`caa5f6fbc62c7dabb36e9ed80d1e8698ebd5f0cb`: all 76 focused units, twelve new
iframe browser cases and both fresh installed consumers. Actual Next reported
82 pages; the seven-file 688,184-byte simulator matched all four built/staged/
installed copies. Five source guards and owned cleanup passed, with six observed
vanished processes and no unknown/remaining identities. Deterministic generation
returned 167 files; owner-controlled adoption is separate from the checked seed.
Keep both failed packets unchanged. Public delivery of this new artifact, public
npm, external hosts, untrusted-HTML isolation and physical-device/full-accessibility
acceptance remain separate; prior hosting evidence retains its original source.

Use the new focused remote packet for these new paths. Source parsing and
authored tests are preparation, not execution. Do not invoke the earlier whole
107/26, 52-case or HTTP packets as substitutes for the new acceptance. Regenerate
canonical source payloads only through the existing owner in isolated storage;
do not hand-edit generated JSON. Keep the accepted public registry and hosting
source unchanged until the new source and generated profile pass.

One bounded temporary public workflow may check an immutable source on main
dispatch with a read-only token. Preparation/publication retains `[skip ci]`;
the broad CI/release definitions and all older QA bookmarks remain unchanged.
Retire the temporary workflow after terminal acceptance. No local heavy runtime
below Storage Guard's reserve, public npm release, new account, paid service,
external tools/model, production data or untrusted-HTML isolation claim.
