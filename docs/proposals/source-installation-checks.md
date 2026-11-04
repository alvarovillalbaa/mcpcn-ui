# Focused source-installation checks — first 52

Last updated: 2026-11-04

4 November 2026. **52/52 passed at the repaired immutable source; first failure retained.**
The owner's repeated “I approve everything / Keep going / Do all the work”
instructions cover this smallest 52-case packet, its seven required package
builds and one temporary public CI job. No additional permission cycle is needed
for that scope. They do not authorize a real account lookup, package publication,
host/tool/provider call or the existing broad release workflow.

The [29 October receipt](../results/2026/10-29/source-installation.md) and its
311-input inventory remain historical. Baseline source
`7ef96f39588777a649dd55ab1101c32b9057dfa1` matched those inputs. First preparation
`639181752c453540ee35758f85d9a22e73907de5` used its separate 313-input seal;
[run 41844232780](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/41844232780)
built all seven packages and reproduced 79 registry entries unchanged, then
reported 50 passed/two failed. All 52 identities and all four full source guards
matched; a `node-compile-cache` fixture entry also failed the empty-directory
gate. The [first receipt](../results/2026/11-04/source-installation-52-attempt-1.md)
retains that failed result and its raw evidence.

The repair changes the test helper to match primitive-array button text,
including the existing negative retry lookup, and routes Node's compile cache
to a separate owned tool-cache directory. Product behavior, the lockfile, all
52 literal names and the source/process/fixture-empty gates stay unchanged.
The observed cache name is consistent with
[Node 24.21's documented default](https://github.com/nodejs/node/blob/v24.21.0/doc/api/module.md#module-compile-cache);
its creator was not independently instrumented. The
[second invocation](../results/2026/11-04/source-installation-52-checks.md),
run `41845730654` / job `126628603128`, checked immutable preparation
`574c87eb57db8cec82eec8319efa875b7299433c` and passed all 52 cases, seven builds,
byte-identical registry generation, four full source guards and owned cleanup.
This result does not substitute the later branch head for the checked source.

## Exact first scope

One temporary public Ubuntu runner, Node 24.21.0, pnpm 10.24.0, twenty-minute
job cap. Install the existing frozen lockfile with lifecycle scripts disabled
and no dependency changes. Build only core, schemas, runtime, React, themes,
registry and CLI packages, in that order. Generate the committed registry from
its owner and require every tracked byte to remain identical; do not exempt or
refresh generated files to make a guard pass.

Run exactly these four files, with one worker and no broad test script:

```sh
pnpm exec vitest run --maxWorkers=1 \
  packages/registry/src/source-registry.test.ts \
  packages/cli/src/installer.test.ts \
  packages/react/src/blocks.test.tsx \
  apps/docs/components/configurator.test.tsx
```

| File | Literal cases | Evidence sought |
| --- | ---: | --- |
| Source registry | 12 | Actual copied implementations/import closure/styles/license, all real blocks, honest aliases, provenance, determinism and rejected missing source |
| Installer | 16 | Real command/configuration, complete ownership, dependencies, local/mock transport, preflight, conflicts, retries, injected write/manifest failures and owned cleanup |
| Workflow blocks | 12 | Eleven real SSR/control/callback paths plus intent/ownership guards; captured JSX callbacks do not establish native browser events |
| Configurator | 12 | Real SSR states, all selections, host/style/mode/manager propagation, empty/invalid states, provider/import/schema parity |
| **Total** | **52** | **Repaired invocation: 52 passed; first failed attempt preserved** |

The [historical inventory](../results/2026/10-29/source-inventory.json) records
the unchanged literal case names. The checked
[complete repair seal](../results/2026/11-04/source-installation-52-repair-source.json)
contains 313 inputs / 12,257,469 bytes and the full suite-plus-literal titles.
Require exactly those 52 unique title/status pairs,
all passed, with no missing, extra, failed, skipped or retried cases. Report/file
order is not an acceptance condition. Exit zero alone is insufficient.

The controller reserves 900 seconds of work and 60 seconds of cleanup inside
the twenty-minute job. Each captured stream is capped at 128 KiB; the JSON
report at 256 KiB, raw Vitest JSON at 256 KiB and lossless compressed Vitest
evidence at 64 KiB. Commands use bounded deadlines and TERM followed by KILL
after three seconds, with a further three-second drain bound. Require observed
exit/close, reaping and original owned-group absence, full source/index/working
guards before/after, preserved historical results and identity-checked cleanup.
Keep `NODE_COMPILE_CACHE` in the owned tool cache, outside the fixture directory;
the fixture directory must still finish empty. Use only fresh owned
HOME/config/cache/temp/fixture directories and no inherited
account/provider credentials. No local installation, build or test is proposed.

## Isolated trigger and source publication

Use only the new inactive example at
`docs/examples/source-installation-52-checks.workflow.yml`. The old
[combined workflow example](../examples/source-installation-checks.workflow.yml)
is preserved as historical source and is not this execution route.

Preparation was published on main with `[skip ci]`, followed by creation of the
owned repair branch `qa/mcpcn-source-52-20261104-attempt-2`. The first branch,
`qa/mcpcn-source-52-20261104`, was retained as a retired bookmark. Only the exact repository
`alvarovillalbaa/mcpcn-ui`, branch type and branch/ref may admit that `create`
event. The read-only temporary workflow checks out the immutable preparation
SHA; it never checks out a floating branch as test source. Main-push broad CI
and release definitions remain unchanged and unexecuted by this route.

Final-publication plan: root removes only the temporary focused workflow on
main with `[skip ci]` and guardedly fast-forwards both owned branches to that
same final source commit. Both remain retired bookmarks; no branch deletion
or repository-wide absence of workflows is claimed. Do not
activate the existing release job or use an npm publishing identity.

This later status edition changes only `AGENTS.md`, `README.md` and this proposal
within the 313-input checked scope; the other 310 inputs remain byte-identical.
Reproduce the immutable preparation above, not the later documentation edition.
All historical seals and the first failed result remain unchanged.

## Subsequent docs and installed-consumer scope — unrun

The original follow-on scope remains prepared but is excluded from the first
52-case invocation: build the docs app, pack those seven packages into local
tarballs without publishing, then run the two authored consumer scenarios in
`tooling/verify-consumers.ts`. Neither scenario has run:

Before that next job, repair the consumer harness's subprocess lifecycle. A
read-only source review found that leader close clears escalation and removes
the active child before original-group absence is verified (lines 83–90,
104–129), while signal handlers are one-shot and removed before awaited drain
(lines 293–312). This is a source finding, not an observed consumer runtime
failure. Keep the strict source/process/cleanup gates; do not execute the old
combined example. The owner's standing authorization covers the next concrete
bounded packet after that repair, without another routine permission question.

1. Existing-app source copy: exact locked third-party dependencies, actual
   compiled source CLI, all 79 selected entries, real editable source and strict
   TypeScript no-emit compilation without MCPCN runtime package imports.
2. Package mode: seven local tarballs, actual installed CLI, all 79 selected
   entries, package exports/provider and strict TypeScript no-emit compilation.

Direct consumer dependencies use exact versions already in the repository lock.
Fresh transitive npm resolution is recorded through each generated consumer
lock hash; equivalence to the workspace's entire transitive graph is not claimed.
Package downloads are the only proposed external network use. There are no
host/MCP/tool/model/provider calls. Both consumers are disposable, task-owned
temporary projects with teardown. Compiler checks keep the repository's
`skipLibCheck: true`: they check copied code and public API usage, not all
third-party declaration internals or every platform/runtime combination.

## Recording and boundaries

Retain bounded raw output, actual source/runtime/tool identities, all discovered
titles/statuses/counts, exits, source/index/mode/blob guards and owned cleanup.
Preserve the first failed attempt before a repair or rerun; source changes need
a new immutable pin and evidence. Tarball identities and consumer outcomes
belong to the subsequent scope, not this first 52-case result.

No broad test suite, browser, real host, server, database, Auth/role/configuration
change, dependency update, production data, account, model call, npm publication,
Vercel/Supabase provisioning, promotion, payment or paid plan is included.
Neither an npm token nor a publishing identity is used. This does not activate
the existing CI/release workflows. The protected staging READY result recorded
on 29 October is not new hosted, browser or live MCP acceptance. Public package
availability, real host protocol behavior and the full product remain unproved;
subsequent work needs a concrete source/target scope, not another routine
approval question for this already authorized first packet.
