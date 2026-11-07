# V1 component browser cases

Status: authored, **unrun**. This is the native-browser portion of the new v1
component packet. It does not repeat the accepted 52 installation checks or the
old installed-consumer packet. The new family schema/SSR checks are separate
commands; this document makes no combined runtime-pass claim.

The source is `tooling/v1-browser.spec.mjs`. Run only its 26 fixed identities
against the actual Next.js production docs server owned by the runner. Component
navigation uses canonical `/components/<slug>` paths without a trailing slash;
there is no redirect waiver or configuration change.
Use isolated Playwright 1.65.0/Chromium, one worker, no retries and a 30-second
per-case limit. Each case creates one fresh context: desktop 1280×900 or narrow
390×844 with mobile/touch emulation. Each narrow case performs at least one
actual tap; selected keyboard operations and focus checks also run. Desktop
keeps the real preview in light mode. Narrow selects its actual dark-mode UI
before interaction and requires the first card's computed background/foreground
to be rgb(24,24,27)/rgb(250,250,250); the light values are
rgb(255,255,255)/rgb(24,24,27). Read-only DOM observations also require the actual
inner viewport, no document-width overflow and the configured touch capability.
No evaluated code changes application state or fabricates evidence. This is not
a physical-device or external MCP-host test. No local install/build/browser run
is authorized by authoring these files.

## Exact case set

Each row is two actual browser identities. Full literal titles live in the
source `CASES` array and are used directly by Playwright.

| Desktop / narrow | Route slug | Native behavior and actual consumer intent |
| --- | --- | --- |
| B01 / B02 | approval-card | Initial consent gate; keyboard checkbox; external busy; rejected intent; double-click dedupe; pending observed before terms replacement; fresh consent; old rejection settlement cannot populate the replacement error surface; exact named-tool intent and numeric callback/settled counts. |
| B03 / B04 | schema-form | Original travelers/cabin/notes replaced by ownerEmail/confirmed/budget; keyboard typing/focus; required boolean; empty optional number stays empty string; rejected then successful duplicate-click submissions contain only current fields. |
| B05 / B06 | confirmation-panel | Consent gate, semantic before/after cells, changed terms reset consent, exact revision/change IDs and cancellation intent. |
| B07 / B08 | risk-review-panel | Controlled acknowledgement retains focus; separate current-terms consent; affected count; exact risk IDs; revision resets both acknowledgement and consent. |
| B09 / B10 | diff-viewer | Semantic table/header/cell roles, zero affected count, keyboard selection, exact change ID and current pressed state. |
| B11 / B12 | source-evidence-panel | Evidence/claim lists, safe link attributes inspected without visiting the external URL, keyboard selection and exact source IDs. |
| B13 / B14 | tool-call-card | Native disclosure of actual arguments/result; exact inspection payload; busy and rejected callback; running/failed status replacement; failure remains a failure with no fabricated result. |
| B15 / B16 | retryable-error-state | Actual retained arguments and attempt; exact retry intent; busy/no-retry state; rejected intent preserves the original failed operation. |
| B17 / B18 | auth-required-card | Exact declared service/scope intent; rejection, consumer-reported pending and unavailable states. No sign-in, credential, redirect or permission grant. |
| B19 / B20 | dynamic-question-flow | Native selection and continuous controlled typing/focus; required checkbox; visible-branch submission; changing branch excludes the hidden old answer; reset removes old answers. |
| B21 / B22 | extracted-fields-review | Confidence/evidence shown; real controlled correction with focus; declared-field submit payload; required-empty gate; reset restores the authored extraction. |
| B23 / B24 | comparison-matrix | Native radio keyboard movement; disabled choice; exact current selection and confirmation; clear; real Ready/Empty/Malformed demo prop modes, with empty output and schema-error UI rather than fabricated browser state. |
| B25 / B26 | score-breakdown | Criterion progress semantics/evidence; actual weighted total 20/25 (80%); keyboard review and exact current criterion IDs. |

Only the actual controls exposed by these demos are exercised. ComparisonMatrix
owns the runtime empty/malformed fixture modes; this does not claim browser
coverage of every invalid payload for all thirteen components. Schema/SSR
malformed-data cases remain a separate layer.

## Runner and evidence interface

- `MCPCN_V1_ORIGIN`: the exact HTTP loopback origin of the owned Next server.
- `MCPCN_V1_BROWSER_TOOLS`: absolute installed `playwright` package directory.
  The spec imports `playwright/test` through `createRequire` anchored there and
  refuses a version other than 1.65.0. Application dependencies stay unchanged.
- `MCPCN_V1_BROWSER_OUTPUT`: existing private owned output directory.
- `SOURCE_COMMIT`: exact immutable checked source SHA.

The runner supplies one Chromium project, workers=1, retries=0 and its real JSON
reporter at `playwright.json`. The spec writes exclusive `B01.json` through
`B26.json` and one final-state viewport `B01.png` through `B26.png`. A PNG and a
case JSON each have a 256 KiB cap. The outer normal-proof budget is 8 MiB gzip;
overflow fails instead of dropping required evidence. Screenshots are final
viewports, not every phase or the full page. Failed cases preserve the available
partial observations and retain the original error after cleanup.

Case JSON schemaVersion 1 records source/case/title/profile/route, actual browser
version, configured/observed viewport, actual preview theme/colors, tracked native
tap/click counts, actual observed action JSON,
network rows, screenshot bytes/hash and cleanup. The actual Playwright reporter
determines case status independently; a file or screenshot alone is not a pass.
No generated success report, private React hook, storage seeding, injected click
handler, request interception, fetch patch or blind sleep is used.

## Network and lifecycle boundary

Fresh contexts allow only observed GET/HEAD requests to the exact owned origin.
Listeners are installed before the first page/navigation. Foreign requests,
HTTP errors, request failures, console/page errors, crashes, unexpected pages,
workers, downloads, dialogs or WebSockets are fatal. Detection is passive;
there is no route allowance or abort waiver. Request metadata retains method,
host/path, timing, status and finite failure classifications, not query values,
headers or bodies.

Every observed response must acknowledge `response.finished() === null` within
its bounded deadline and the same actual Request must emit `requestfinished`.
The main navigation additionally requires a positive exact-object identity,
expected route and HTTP 200. Normal closure drains observed operations before
and after the screenshot. The case records and requires one created/closed page,
acknowledged context close, zero pending requests/jobs and zero boundary errors.
Late/unfinished operations stay unproved. Work/screenshot checks use the original
26-second work cutoff, context/observer cleanup has an absolute 29-second cutoff,
and the native test limit remains 30 seconds. The outer supervisor separately
owns server/browser process groups, pipes and scratch teardown.

These are Playwright terminal acknowledgements, not raw-wire EOF, all-asset
integrity, continuous-state attestation, production-hosted browser acceptance,
real MCP-host interoperability, full accessibility conformance, business
authorization, authentication, persistence, provider/model or paid-service proof.
