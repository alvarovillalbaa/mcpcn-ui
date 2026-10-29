# Proposed source-installation checks

29 October 2026. **Prepared, unapproved and unrun.** The supplied AGENTS.md
§§7/14 and local repository instructions require approval for new domain/CLI/
SSR checks and temporary CI. Source publication is authorized separately by
the portfolio goal; it does not authorize activating the release workflow.

## Exact scope

One temporary public Ubuntu runner, Node 24.21.0, pnpm 10.24.0, twenty-minute
job cap. Install the existing frozen lockfile without dependency changes; build
only core, schemas, runtime, React, themes, registry and CLI packages. Generate
the committed registry from its owner and require it to remain byte-identical.

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
| **Total** | **52** | **All newly authored and currently unrun** |

Literal names and exact input hashes are frozen in the
[source inventory](../results/2026/10-29/source-inventory.json). The runner must
match the actual JSON report's complete passing title set and count to that
inventory; its process exit alone is insufficient.

Then build the docs app, pack those seven packages into local tarballs without
publishing, and run only the two authored consumer scenarios in
`tooling/verify-consumers.ts`:

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

The [inactive workflow example](../examples/source-installation-checks.workflow.yml)
is reviewable source outside `.github/workflows`; it cannot run by publication.
If approved, activate only that manual, read-only workflow for this source,
retain logs, exact source/runtime hashes, all discovered names/counts, exits,
tarball identities and both consumer outcomes, then remove the temporary
workflow. Missing/extra cases cannot count as success. Retain failed attempts;
bounded repairs and same-scope reruns must record updated source hashes.

No broad test suite, browser, real host, server, database, Auth/role/configuration
change, dependency update, production data, account, model call, npm publication,
Vercel/Supabase provisioning, promotion, payment or paid plan is included.
Neither an npm token nor a publishing identity is used. This does not activate
the existing CI/release workflows. Further cases or release/host acceptance need
their own concrete scope.
