# Reported host and availability states

Replace the seven named generic aliases with typed BillingGate,
UnsupportedHostNotice, NoDataState, LoadingBridgeState, OfflineState,
PermissionDeniedState and ExpiredSessionState. Preserve all 79 catalogue
identities, package imports, editable source installation and eleven blocks.

Each payload has a strict state-specific shape, stable `id` and `revision`,
visible `title` and `message`, optional description/reported timestamp and an
optional explicitly supplied action `{ id, revision, label, available }`.
No action is created by default. Unknown fields, foreign prototypes, accessors,
symbols, cycles, sparse arrays, nonfinite numbers, oversized text/collections and
contradictory progress are rejected before rendering. Entire parsed payloads
fit 64 KiB of UTF-8 JSON; text is rendered literally.

| Component | Reported state and complete visible fields | Optional intent |
| --- | --- | --- |
| BillingGate | `billing-required`; feature label, current/required plan if supplied | `request-billing-review` |
| UnsupportedHostNotice | `unsupported-host`; host label and every missing/unsupported/unknown capability | `request-compatible-host` |
| NoDataState | `empty`; collection, explicit no-records/no-matches/not-yet-provided reason, optional query summary | `request-data-refresh` |
| LoadingBridgeState | `waiting`; bridge, connecting/awaiting-host/awaiting-tool-result phase, optional reported elapsed time and work counts | `request-bridge-recheck` |
| OfflineState | `offline`; service and optional unsent-change count | `request-reconnect` |
| PermissionDeniedState | `denied`; resource, optional requester and all reported requested scopes | `request-access-review` |
| ExpiredSessionState | `expired`; service and optional expiry timestamp | `request-session-renewal` |

Each intent contains exactly `componentId`, `componentRevision`, `actionId` and
`actionRevision`. Visible reasons, labels, plan names, queries, progress, scopes,
timestamps and unsent-change counts remain private presentation data. These
controls call no tools, accept no credentials, navigate to no URL, create no
payment or authorization and make no network/browser-state observation.
The consuming app validates current server-side authority before any action.

Zero elapsed time, zero unsent changes and zero completed work are distinct from
absence. Supplied order and labels are preserved. Completion of a work counter
does not establish bridge readiness. The component never starts a timer,
subscribes to connectivity, inspects a session or infers permission/billing.
An expiry later than a supplied report timestamp is contradictory and rejected.

Buttons are absent without a supplied action and disabled when unavailable,
busy or without a callback. One pending request blocks duplicate activation.
Callback failure gives generic retryable feedback, never leaked exception text
or an optimistic state change. Data/kind changes remount request ownership;
callback replacement and unmount invalidate old pending settlements, including
an A/B/A transition. A resolved callback only ends pending feedback.

Verification must cover all seven package and copied-source exports, strict
schemas/public JSON Schema, actual distinct rendered semantics, escaped text,
identity-only callbacks, absent/unavailable/busy controls, held failures and
callback/data/unmount fences, all seven desktop/narrow docs previews and actual
playground payload validation. Use authored T2 data only. Existing focused
cohorts remain closed; a new bounded CI packet owns new execution evidence.
