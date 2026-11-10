# Focused block recipe checks

Last updated: 2026-11-10. Status: authored and frozen before first execution.

Standing owner approval covers this necessary free implementation, focused
verification, one temporary public CI job and publication. Baseline is clean
e151f8ac90132f362133c5d471b94acee39e972b. Follow the
[source contract](../specs/block-server-recipes.md). Previous packets stay closed.
No new dependency version, external Auth/provider setting, account, model call,
production data, paid plan or public npm publication is proposed here.

Local Storage Guard reports9.4GiB available/34GiB required. Do not import or run
the app locally, install, compile, start servers/browsers or open test databases.
Local preparation is source/data/static only. The four new CI scripts passed
`node --check` and authored changes passed `git diff --check`; neither is an
application build or runtime test receipt.

## Authored scope

| Owner | Executed cases |
| --- | --- |
| packages/server/src/block-recipes.test.ts |39:eleven real SDK/SQL fixtures,12store invariants,16real SDK planner/executor cases |
| packages/registry/src/block-source.test.ts |15:all68component payloads,eleven complete block profiles,client/server graph/dependency boundaries |
| packages/cli/src/block-installation.test.ts |6:actual CLI union/package mode,foreign/missing file rejection,owner edit/symlink preservation |
| Selected existing checks |2:PC-R02 and PC-CLI06,updated only for the deliberately expanded block profile |

Total62executed cases,60new/two selected regressions. Other historical cases
remain outside the filter; their earlier packets are not replayed. Use the real
SDK Client/McpServer/InMemoryTransport, not a fake successful tool handler.
Store cases cover dedicated-schema refusal, seed preservation, token scope,
exclusive expiry, policy revision, consumed replay, private cancellation cleanup,
two-handle CAS, restart persistence, pending-review recovery, cancellation rollback
and revoked grants. Protocol cases cover actual SQL bulk rollback, row/step/field
validation, unavailable executors/options, sanitized failure, original context,
registration lifecycle/partial rollback, async executor rejection, captured-term
substitution and report evidence. Strict source checking uses skipLibCheck:false.

## Installed consumers and archives

Build/pack the eight existing packages with the locked workspace and unchanged
external resolutions. Export additions do not require a lockfile change.
Build the existing playground asset before the real unscoped `mcpcn` CLI.
Invoke each owning package directory directly so an empty filter cannot pass
as a build. Archive names and consumer dependency/bin paths come from validated
package identities; the CLI archive is mcpcn-0.1.0.tgz. This execution repair
follows the preserved third attempt and retains the same assertions/profile.

Fresh archive consumers use exact existing React/Zod/SDK/ext-apps/TS/Node-types versions.
Run the actual installed CLI in package mode(124unique files/six per block) and
copy mode(171unique files/53per block/158TS files), including a CommonJS caller.
Check package server declarations with strict Bundler and NodeNext; run eleven
actual persisted SDK fixtures in each consumer. Compile the complete copied
source with strict Bundler, run its eleven emitted native Node tests and build
both real Vite client graphs. No skipLibCheck, declaration shim or vendor patch.

Package a portable source archive from all171byte-verified actual CLI files plus
its own portable package/manifest/README/client/build files. Extract afresh,
install, strictly compile, run all eleven real SDK/SQLite tests and build Vite.
That archive contains no node_modules, Git history, database, cookie, installed
package references or local registry paths. Retain all nine actual archives and
their independently computed hashes. Full copied-source NodeNext is explicitly
outside this profile because existing client imports and pinned upstream
implementation declarations use extensionless paths; it remains open quality
work. This boundary is frozen before any execution, not narrowed after failure.

## Actual browser workflows

Use Chromium at1280and390pixels with real AppBridge/OfficialMCPAdapter, actual
SDK sessions and disposable file-backed SQLite. Start four real fixture processes:
flow then restart/reload at each width. Each process owns eleven registrations.
Require the per-launch loopback HttpOnly capability cookie, exact Host/Origin,
bounded requests/CSP, and refuse guest access. This is a CI-only authored host,
not production authentication. Its fixed check principal is never a public server.

Each of22flow journeys reads actual initial state, prepares unchecked exact
terms, cancels the old review, prepares fresh unchecked terms, confirms, reads
saved results and explicitly reloads. Forms preserve0/false; selections preserve
full evidence; retry preserves earlier results and separately reviews the queued
step; file selection never auto-extracts and acceptance uses a separate review;
bulk applies only selected business rows. One390px gated-call journey forwards a
real commit but drops its response, then proves mutation blocking/read recovery.
Restart journeys22read saved status/audit from reopened SQLite. Two report
journeys use native keyboard End on the full retained evidence viewer.

Require44workflow profiles/111DOM snapshots/22PNGs/two End readings and complete
actual SDK traffic from all four gracefully closed processes. Build the exact
production docs graph with forced Turbo tasks, then check two docs widths:
four DOM snapshots/twoPNGs plus22actual item and22PNG downloads with canonical
byte parity. Overall46profiles/115DOM/24PNG. Browser consoles, unexpected failed
requests, network beyond the loopback origin and horizontal overflow fail;
exactly one deliberately lost confirmation response is declared.

## Frozen ownership and finite bounds

Before execution measure source/export bounds and freeze the exact candidate.
At preparation the source is about998MB/8210files and the export about110MB;
the existing largest file is34934675bytes. New block shared source is about113KB;
all79declared bodies already exceed32MiB before wrappers, so the CLI deliberately
uses36MiB cumulative source,53files/item,2MiB JSON/file,10s request deadlines and
the unchanged500-path lock cap. These are prospective bounds, not a test bypass.

Controller:9500source files/1GiB total/40MiB per file/128MiB export;4MiB per
original command stream;4MiB per published archive;16MiB compressed derived
archive;64MiB complete retained packet. The canonical checkout is read-only.
All scratch/processes have a private owner nonce and Linux process identity.
Keep actual original stdout/stderr, JSON receipts, PNGs, archives and failures.
Do not truncate evidence and call it complete. Never retain per-launch access
cookies; private ready files stay only in the removed owned scratch directory.

Expected generated adoption is exactly35paths:registry index+eleven block pairs
(23),eleven desktop PNGs and their manifest(12). Independently verify original
archive/manifest hashes before any adoption. Preserve every other tracked source,
all68component pairs/config schema(137registry paths), existing helper entries,
five accepted reference applications, lockfile, index and native HEAD. Generated
registry bytes are never hand-edited. Retain compressed originals rather than
duplicating the roughly50MB of raw derived JSON into a base64 evidence packet.

After seven preserved attempts the candidate has8679files/1006322704bytes.
The next retained failure adds140original/manifest files plus its report; the
planned passing packet,12preview assets and later public proof cross9000files.
Before the eighth execution,raise only that prospective retention count to9500.
All byte budgets, business/browser assertions and cases stay fixed. Do not omit
failed originals merely to keep the earlier count. This is a measured source
retention allowance,not acceptance of an application failure.

The temporary public manual workflow pins checkout/setup/upload actions and
Node24.22.2/Ubuntu24.04. It is contents-read-only,20minutes maximum,retention1day;
the controller stops work at17minutes for closure/upload. Preserve every attempted
candidate and failed packet as accepted ancestry. Disable the workflow and verify
that state before deleting its definition. Publication/deployment/anonymous HTTP,
owned QA-ref retirement and verified duplicate cleanup are separate actual receipts.
Public npm, external-host, production-provider, full quality/accessibility/device
and adoption requirements remain unfinished in the full brief.
