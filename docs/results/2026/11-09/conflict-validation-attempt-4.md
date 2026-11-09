# Conflict and validation — fourth invocation failed

Checked source `d43574200766c4aab9ec497b9570eb40b01f0070`, a direct BASE child,
used workflow `25b3a0a7a7bb87a4908069c1de5e0af5ea907c8a` / `411662634` in
[run 42561289218](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42561289218),
job `128978047575`. It failed with `browser_reporter_totals` on 9 November 2026.
The [first](conflict-validation-attempt-1.md),
[second](conflict-validation-attempt-2.md) and
[third](conflict-validation-attempt-3.md) invocations retain their original outcomes.

All 105 authored unit cases in six files and the 12 separate unchanged
process-ownership prerequisites passed. The actual docs build completed 81 pages.
Both fresh consumers passed: C01-package installed 80 files and C02-copy installed
111 files; each completed strict typechecking and four actual SSR profiles.
The finite 33-file payload/lock repair and its five new installer cases therefore
passed this invocation. Generation was deterministic across 167 returned bodies;
seven archives were packed and retained. No generated output was adopted.

The [actual Playwright report](conflict-validation-attempt-4-originals/output-browser-playwright.json)
records 10 passed and two failed cases, with no skipped or flaky cases. R09 and
R10 failed at the same real Confirm click/tap: the button remained disabled after
returning to a previously selected candidate. Their last recorded stage proves
the old confirmation had settled, with zero pending confirmations. The
[desktop failure image](conflict-validation-attempt-4-originals/output-browser-R09.png)
shows the stale pending-confirmation message and disabled Confirm after the new
selection notification. This is a product feedback-lifetime defect, not a reason
to force the control or relax the browser assertion.

Source review identifies the repeated-scope path: select A, request confirmation,
switch and clear, settle the old request, then select A again. Feedback visibility
matched only the semantic scope, allowing old pending/error state to reappear
when that scope returned despite the request generation having been invalidated.
The prospective fifth source tags feedback with the current generation and
requires both generation and scope to match before showing pending/error state.
Existing live-settlement guards and all browser actions/assertions remain fixed.

The raw partial browser evidence contains 76 stages, 152 DOM snapshots, two
keyboard-reading proofs and 22 PNGs. R09/R10 each retain three stages, five DOM
snapshots and their final PNG; neither reached its stage PNG. These partial
counts do not establish the planned complete 88-stage/190-DOM/24-PNG profile.
The controller accepted-browser count remains zero because the whole browser
packet failed. Individual browser passes remain partial observations.

All four reached native source guards and all nine reached export guards passed.
All 51 parent commands retained 102 original streams. Owned cleanup passed:
the scratch root was removed, zero owned processes remained and no uncertainty
was recorded. The [retention record](conflict-validation-attempt-4-originals/retention.json)
binds 165 normal originals plus one generated transport, decode metadata and
retention metadata: 168 canonical files / 26,243,233 bytes, retention SHA256
`f135b2fb0a8ef72bf2576b22c230c6e4c2346894604f32849611bf87ec6bddf3`.
The complete private raw job log is 27,281,821 bytes, SHA256
`c17dc6effe85335265e53880a3a92460ae448a6b2c820ee4a3a854a12d8d35dc`.
`generation.tested` and `generatedAdopted` remain false. Preserve this source,
QA ref, run originals and all partial results before any fifth invocation.

The raw receipt's first `proofLimits` sentence still says five authored files
and omits the new CLI file. This is a retained prose error: its actual static
manifest and runner originals prove 105 cases in six files, including five CLI
cases. The raw receipt is unchanged. The fifth controller corrects only that
sentence to six files and includes CLI; no execution gate or historical result
is changed by the prose correction.
