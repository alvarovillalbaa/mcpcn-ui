# Reference docs build graph repair

10 November 2026. Standing owner approval covers this necessary free repair.
The [accepted workflows](../results/2026/11-10/reference-workflow-checks.md)
and exact source release remain closed. Initial Vercel deployment failed because
Next production type-checks a docs test importing the document app,whose private
shared package was absent from the Turbo docs build graph. Preserve the actual
[provider failure](../results/2026/11-10/reference-workflows/initial-deployment-failure.json).

Declare the existing private @mcpcn/reference-workflows workspace as an explicit
docs development/build dependency. Do not exclude tests,skip diagnostics,change
the app implementation or override provider settings. CI must derive exactly
one apps/docs devDependency importer edge in the lock:workspace:* to
link:../../examples/shared. All external versions/integrities/catalogs/snapshots
and all other importers remain unchanged. Adopt only that verified lock file.

Use the [temporary pinned workflow](../examples/reference-docs-build-checks.workflow.yml)
on public main:Ubuntu24.04/Node24.22.2/read-only/manual/twenty-minute job,
seventeen-minute work deadline,exact immutable candidate directly after
b42b1ca69139c3d484adf358240f85565243aaa2. Fresh frozen-install and execute the
exact existing Vercel command:pnpm exec turbo run build --filter=@mcpcn/docs...
The build must include the shared package and succeed through actual Next
production TypeScript/static generation. Preserve160registry files and the
accepted reference source/gallery/release. No replay of the closed80case/
22browser/fresh-workbench packet and no claim this build replaces it.

Retain original streams,source/process/root guards and owned closure. Keep
8500files/1GiBtotal/40MiBfile/128MiBexport,4MiBstreams/2MiBGit/64MiBpacket and
<=1MiB one-path generated payload. Storage Guard still blocks local heavy
runtime. No local application execution,account,paidplan,model,provider or
production data. Disable before deleting the temporary workflow,preserve the
source parent,retire only this exact QA ref,then redeploy accepted source and
finish anonymous guide/gallery/image/manifest delivery. The checked source
bundle remains byte-identical because it excludes the docs workspace and its
fresh local install/build already passed independently.
