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
Keep both failed packets unchanged. The separate
[public HTTP delivery](docs/results/2026/11-08/playground-public-delivery.md)
passed sixteen anonymous canonical-origin GET observations at comparison source
`6489c25dfa38b51076fab77eb8429ece3fc5239a`: the original seven routes, plus the
SSR wrapper, manifest and every one of the seven passing-CI artifact files.
All bodies and request/response/socket closures completed. READY/source/alias
metadata remains separate from HTTP, and the twelve earlier browser cases ran
on owned localhost CI services. Public npm, external hosts, untrusted-HTML
isolation, hosted interaction and physical-device/full-accessibility acceptance
remain separate; prior receipts retain their original source identities.

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

## Five approval components — 8 November 2026

Standing owner approval covers the separate [approval catalogue scope](docs/proposals/approval-components-checks.md):
all five remaining approval aliases become typed dedicated interactions with
schemas, controlled playground/docs and editable source installation. Preserve
all 79 catalogue identities; 21 specialized components leave 35 honest aliases
unfinished. Callback intent does not execute tools, alter authorization or grant
permissions. No runtime/server/core or dependency/lock changes are intended.

The immutable candidate belongs to `qa/mcpcn-approval-components-20261108`,
directly after `3e9e787863002c59b13736597a416019035508d1`. Publish the concrete
controller/proposal before a single main-only manual temporary CI dispatch.
Its own scope is 79 new literal unit/SSR cases, twelve new desktop/narrow browser
cases and two fresh relevant installed consumers; historical checks stay closed.
The new copy closure appends two owner modules after the original fourteen.
Generate the existing 167 owner outputs only in private CI export, verify every
module/item/schema and deterministic regeneration, then retain/adopt exact
passing bytes separately from the seed commit. Never edit generated JSON manually.

Keep accepted runtime/registry/hosting unchanged before acceptance; temporary
main preparation adds only its workflow and retains `[skip ci]`. Preserve broad
workflows, older QA bookmarks, raw failed receipts, source/stream/process gates
and verified owned cleanup. Retire owned controls afterward. Storage Guard now
fails at 6.9 GiB free/34 GiB required: no local install/build/test/app/server/
browser execution. Source parsing/static/data handling is separate. No paid
service/account, external host/tool/model, public npm or full-product acceptance
belongs to this packet.

This approval cohort passed once at `b67ee0819b4e07fcf3a177750079c9b459e57ab2`:
79 units/SSR, twelve browser cases and both fresh consumers. The
[canonical receipt](docs/results/2026/11-08/approval-checks.md) retains exact
originals and the separately adopted 167-path generated vector. This packet
is closed; do not rerun it merely to support a later catalogue cohort. Later
publication may remove the controller's one trailing blank line only; the
checked controller hash remains bound to the immutable candidate.

Accepted publication `a526f29b90a056963eec2c8382942302f881959b` deployed once;
the [delivery record](docs/results/2026/11-08/approval-public-delivery.md) retains
provider, sixteen anonymous HTTP and seven candidate-archive boundaries.
Workflow411128785 was disabled then removed; only the two original broad
workflows remain. The owned approval QA branch is retired; its immutable source
remains an accepted merge parent. Preserve all older QA bookmarks and releases.

## Five remaining tool-execution components — 8 November 2026

Standing owner approval covers the [tool-workflow scope](docs/proposals/tool-workflow-checks.md)
and [contract](docs/specs/tool-workflow-components.md). Preserve the other 21
specialized implementations and all 79 identities; the new source has 26
specialized/30 generic components. New intents contain current identity/status/
attempt and never execute tools, queues, tracing, network, model context,
clocks, permissions or billing. Reuse the bounded JSON guard through one named
export; append two owner modules after sixteen. Existing runtime/server/core,
host protocols, manifests/lock and styling stay fixed. Narrow old test count/
closure expectations and unrelated-alias sentinels follow the new contract;
closed historical packets are not rerun or relabelled.

Publish the exact candidate directly after `d94ba3b2` on
`qa/mcpcn-tool-workflows-20261108` before one temporary manual main dispatch.
Use read-only token/public Ubuntu/twenty-minute cap and `[skip ci]` preparation/
publication. Its own 91 literal unit/SSR cases, twelve browser cases and two
fresh consumers must run. Verify all 167 generated paths, eighteen modules,
22/23-file payloads, 101/80 installed files and deterministic generation.
Retain exact output/vector separately from seed Git bytes.

The new output budget is 12 MiB generated gzip, 8 MiB normal, 20 MiB aggregate,
128 MiB raw, set before execution for source growth. Keep accepted supervisor
semantics fixed. Direct browser proof must distinguish selected-section busy/
feedback from parent state and producer alerts; forced iframe remount cannot
prove same-root member replacement. Storage Guard fails at 25.4 GiB free/34 GiB
required: no local application/install/build/test suite/browser/server. Keep
accepted main runtime/registry/hosting fixed until this new packet passes; then
adopt only verified output and publish to existing resources. Retire only owned
controls. No paid service/account, provider/model, npm or full-product claim.

The [first tool-workflow invocation](docs/results/2026/11-08/tool-workflow-attempt-1.md)
remains immutable failed 90/91 at `5759187c`; consumers/browser were not reached.
The changed-source second candidate on
`qa/mcpcn-tool-workflows-20261108-attempt-2`, directly parented by `d94ba3b2`,
passed at `ad288e1f63814211d061e7258ea330b1048fa30a`: all 91 unit/SSR cases,
twelve desktop/narrow browser cases and two fresh installed consumers. The
[canonical CI receipt](docs/results/2026/11-08/tool-workflow-checks.md) retains
the originals and separately adopted 167-path generated vector. The repair
only prevented serialization of already-invalid nested data and extended the
existing zero-getter case; the old JSON guard and packet controls stayed fixed.
This cohort's CI packet is accepted; preserve the failed source/originals and
both source identities. The separate [public delivery](docs/results/2026/11-08/tool-workflow-public-delivery.md)
binds accepted publication `c33e8a13` to READY deployment, sixteen anonymous HTTP
observations and seven unchanged candidate archives. Workflow411202304 was
disabled and removed; only the two original broad definitions remain. Both
owned QA branches are retired with source preserved as merge parents. This
cohort is closed; later work must select an actual unfinished requirement
instead of rerunning this packet for a different catalogue cohort.

## Five remaining form components — 8 November 2026

Standing owner authorization covers the separate [form contract](docs/specs/form-workflow-components.md)
and [focused checks](docs/proposals/form-workflow-checks.md). MissingDataRequest,
MultiStepForm, InlineEditForm, FormProgressCard and ValidatedFieldList become
dedicated typed forms/reviews; preserve79 identities, target31 specialized/25
generic. Explicit submits carry only current human-reviewed values/changes;
navigation/inspection carries IDs. Reported validation/progress never implies
authorization or inferred completion. Preserve old APIs, runtime/server/core,
host protocols, dependencies/lock, primitives and styles. Append two owner
modules after18; source-copy closure20 modules,24/25-file payloads,80/103 files.

Use exact baseline5652a906 and new owned QAqa/mcpcn-form-workflows-20261108.
Publish concrete source/controller/counts before manual main-only public read-
only20-minute CI; main preparation/publication retains [skip ci]. New five
literal unit files/twelve F01–F12 browser cases/two fresh consumers are separate
from every closed packet. Source cap2500 and raw receipt-only8MiB are set before
execution for actual baseline growth; other normal originals4MiB, compressed
normal8/generated12/aggregate20MiB and generated raw128MiB retain finite bounds.
Keep accepted generic process/stream/source/cleanup supervision fixed.

Storage Guard now fails24.9GiB/34required: local source/static/data only, no app/
install/build/test suite/browser/server. No new paid service/account, model/tool,
npm or full-product claim. Keep accepted registry/hosting until new source and
owner-generated output pass, retain originals/failures, adopt verified bytes,
publish/deploy existing resources and retire only this cohort's owned controls.

The [first form invocation](docs/results/2026/11-08/form-workflow-attempt-1.md)
failed at source15047be9 on React TS2322 before units/consumers/browser or owner
generation. Preserve all44 normal originals, source, failed status and verified
cleanup. Repair only repeated record-index narrowing by capturing the previous
entry once and explicitly checking undefined. The changed candidate directly
follows5652a906 on qa/mcpcn-form-workflows-20261108-attempt-2; keep first source
and both QA refs until preserved as accepted merge parents. Same110 identities,
controller/browser/consumer/limits; no carried passes or unchanged rerun.

The [second form invocation](docs/results/2026/11-08/form-workflow-attempt-2.md)
passed110 units and the package consumer, but editable CLI add79 exceeded the
16MiB cumulative declared-source cap. Preserve106 normal originals, the failed
generated gzip and source06170701; no browser acceptance or output adoption.
The third sibling on qa/mcpcn-form-workflows-20261108-attempt-3 raises only the
CLI cumulative source cap to32MiB before execution. Repeated-source accounting,
2MiB per payload/source file and all transaction/timeout/cleanup checks remain.
Keep all110 identities, twelve browsers, two consumers and packet gates fixed;
preserve every candidate as an accepted merge parent before QA retirement.

The [third form invocation](docs/results/2026/11-08/form-workflow-attempt-3.md)
passed110 units, both consumers and ten browser cases. F11/F12 failed initial
observation before interaction because external BODY focus text included all
docs/snippets. The fourth sibling on qa/mcpcn-form-workflows-20261108-attempt-4
scopes focus text to the actual region while keeping external focus identity,
full component DOM, all assertions,64KiB originals and every packet gate.
No app/controller/consumer change or carried pass; retain all failed evidence.

The [fourth form invocation](docs/results/2026/11-08/form-workflow-attempt-4.md)
passed110/12/2 product checks but failed ownership closure, retaining its root
and seven stable-unreadable observations. The fifth sibling on
qa/mcpcn-form-workflows-20261108-attempt-5 introduces the explicit prospective
[two-edge protocol](docs/specs/form-workflow-process-ownership.md), twelve
additional helper fixtures and unchanged110/12/2 product checks. This extends
the old independent-parent rule with fresh exact nonce-group/kernel-edge proof;
derived parents remain ineligible as independent anchors and unknown/off-chain
ownership remains fatal. No zombie exemption, recursive trust or browser flag
change. Publish the concrete packet first; preserve all failed originals.

The [fifth form invocation](docs/results/2026/11-08/form-workflow-attempt-5.md)
passed12 ownership fixtures and110/12/2 product checks, including eight actual
two-edge proofs, but two late unknown processes still failed closure. The sixth
sibling on qa/mcpcn-form-workflows-20261108-attempt-6 collects the same proof
eagerly for readable marker-absent candidates in a fresh exact independently
owned group. Selection grants nothing; actual proof failure remains fatal.
Expand the same12 fixture identities, preserve110/browser/consumer bytes and
all proof/closure rules. Earlier unrecorded readable states are inference only.

The [sixth form invocation](docs/results/2026/11-08/form-workflow-checks.md)
passed at3b0b203225cf41aa2cd339afb977f24182991a22: twelve expanded ownership
fixtures and unchanged110 product units/twelve browsers/two fresh consumers.
All55 commands/110 streams, five2342-file source guards, ten export guards and
owned teardown passed. Sixteen eager proofs were accepted with26 bounded probes;
zero unknown identities remained and the root was removed. The167 generated
paths were verified;159 changed outputs adopted with a separate publication
vector. All five failed sources/originals remain failed. Workflow411297713 is
disabled; accepted publication removes its definition and preserves all six
candidate sources as parents before retiring only owned QA refs. CI is closed;
delivery/publication proof is separate and the broader library remains unfinished.
