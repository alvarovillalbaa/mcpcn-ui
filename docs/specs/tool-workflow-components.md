# Tool execution results, progress, partials, queue and trace

This cohort completes the eight-component tool-execution category in the
[owning Notion brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7).
The returned page remains unverified, last edited 24 August 2026; its explicit
intent is visible progress/outcomes and retrying specific steps. Existing
ToolProgressTimeline, ToolCallCard and RetryableErrorState stay unchanged.
The five remaining aliases become dedicated components. All 79 identities stay
fixed: 26 specialized components and 30 generic aliases after this work.
This is preparation; new checks have not run. Older packets remain closed.

Existing uses of these five informational aliases must adopt their dedicated
data contracts. GenericAgentComponent remains available for generic information;
the other thirty aliases keep their existing shape.

## Shared contract

New schemas live in `packages/schemas/src/tool-workflow-schemas.ts`, React in
`packages/react/src/tool-workflow-components.tsx`. Add only a named public export
of the existing bounded `jsonValue` as `InspectableJSONSchema` from
`execution-schemas.ts`; reuse its guard without changing existing behavior.
Append these two new owner modules after the existing sixteen source modules.
Copy closure becomes eighteen modules, 22 files per component, 23 per block,
101 installed source files; package installation remains 80 files.

All components require `id` and `title`; optional `description`; `disabled`
defaults false. IDs are trimmed, nonblank, control-free strings up to 128 UTF-16
units. Titles are nonblank up to 240; descriptions/messages up to 2,000; visible
labels up to 500; action labels up to 120. Every supplied visible text is
nonblank, including optional descriptions/messages. Raw JSON strings retain
empty and whitespace-only values. Visible text permits tabs/newlines, but not
other ASCII controls or DEL. Collections contain at most 100 entries, with
unique IDs and current controlled selection references. Unknown root/nested
fields are refused. Parsed payloads have a collective 256 KiB UTF-8 JSON bound.
Safe integer fields refuse fractions, infinities, negatives and unsafe values.
Schema descriptions disclose rules not representable by generated JSON Schema.

The existing bounded finite/acyclic JSON guard owns every `result`, `value` or
`details`. Explicit null, false, zero and empty strings remain distinct from a
missing value. Never coerce objects through String or silently truncate them.

`onAction`, `busy`, `error` and `className` are React inputs, removed before
strict DTO parsing. Busy, disabled and missing callback prevent consumer intent.
Reuse native controls, existing styling, Feedback and useComponentAction. There
is no tool, queue, tracing, network, clipboard, clock or authorization runtime.
Data reports consumer state; a percentage/time/count never implies completion.
All action data contains identity/status/attempt information only, never raw
result values, error messages or trace details. Consumers independently validate
and execute requests. Incoming data visibility is still the consumer's duty;
metadata does not remove data already supplied to a model.

## ToolResultCard / tool-result-card

Required `tool` (ID rules), `status: succeeded | failed | partial`.
Optional `result: InspectableJSON`, `errorMessage`.
Succeeded and partial outcomes require a supplied result, including null.
Failed outcomes require errorMessage; a failed outcome may retain a result,
labelled incomplete. Error detail is forbidden on succeeded outcomes.
`resultLabel` defaults Result; `inspectLabel` defaults Inspect outcome.
Render the explicit outcome, absence/incompleteness and expandable structured
content. `inspect-result` emits `{id,tool,status}` and never echoes the result.

## RunningTaskCard / running-task-card

Required `status: queued | running | paused | completed | failed | cancelled`.
Optional `currentStep`, `elapsedMs`, `errorMessage`, and
`progress: {completed,total}` (completed nonnegative safe integer, total positive
safe integer, completed <= total). A queued task with progress has completed0;
completed status with progress requires completed===total. Running100% is valid
and stays running. errorMessage is permitted only for failed status.
`cancellable` defaults false. `inspectLabel` defaults Inspect task;
`cancelLabel` defaults Request cancellation. Cancellation is available only when
explicitly cancellable and status queued/running/paused. Intent `inspect-task`
emits `{id}`; `cancel-task` emits `{id,status}`. Display elapsed only when
supplied; do not start a timer or invent progress. Progress updates preserve a
pending operation; changed task ID/status fences old feedback and settlement.

## PartialResultViewer / partial-result-viewer

Required `status: streaming | partial | complete | failed`, `parts` (may empty).
Each part has `id`, `label`, `status: available | failed | pending`, optional
`value`, `message`, `attempt` (1..1000, default1), `retryable` (defaultfalse).
Available requires a supplied value; failed requires message and may retain
labelled partial content. Pending forbids value/message. Retryable is true only
for failed parts. Complete overall status requires every part available; an
empty complete result is honest. Other overall states are explicit and are not
inferred from current parts. Optional controlled `selectedPartId` references a
current part, including unavailable parts whose state remains inspectable.

Show ordered parts, availability counts and selected structured content, with
distinct empty, pending, failed and incomplete states. Labels default
`inspectLabel: Inspect part`, `retryLabel: Request part retry`.
`select-result-part` emits `{id,partId}`; `inspect-result-part` emits
`{id,partId,status,attempt}`; `retry-result-part` emits `{id,partId,attempt}` only
for an explicitly retryable failed part. Selection keeps list node/focus.
Fence selected-part feedback when its operation identity/attempt/content changes;
an old settlement must not modify its replacement. Unrelated appended parts
must not re-enable a pending retry of the same unchanged selected part.

## QueuedStepList / queued-step-list

Required ordered `steps` (may empty). Each has `id`, `label`,
`status: queued | running | succeeded | failed | skipped | cancelled`, optional
`message`, `attempt` (0..1000, default0) and `retryable` (defaultfalse).
Running/succeeded/failed require attempt>=1; queued/skipped/cancelled may have
zero attempts. Retryable is true only on failed steps. Do not impose a queue
engine or refuse concurrent running steps. Optional controlled `selectedStepId`
references a current step. Default labels Inspect step / Request step retry.

Render original order and reported attempts/statuses without auto-advancing.
`select-queued-step` emits `{id,stepId}`; `inspect-queued-step` emits
`{id,stepId,status,attempt}`; `retry-queued-step` emits `{id,stepId,attempt}` only
for an explicitly retryable failed step. Current step identity/attempt/terms
fence old feedback; controlled selection retains list node/focus. Unrelated
queue updates must not reset the unchanged selected step's pending retry.

## ToolTraceViewer / tool-trace-viewer

Required ordered `events` (may empty). Each has `id`, `label`,
`kind: input | progress | output | error | note`, optional `parentId`, `elapsedMs`
and bounded JSON `details`. Parent references must exist, be non-self and form
an acyclic graph; parents may arrive later in the supplied array. Order is
consumer order, never silently sorted. elapsedMs is a nonnegative safe integer
reported by the source, with no inferred wall clock or duration.

Controlled `filterKind` defaults all and allows all plus the five kinds.
Optional controlled `selectedEventId` must be current. A selected event hidden
by the filter is valid: explain that state, conceal its details and disable
inspection until it is visible. Default `inspectLabel: Inspect event`.
`change-trace-filter` emits `{id,kind}`; `select-trace-event` emits `{id,eventId}`;
`inspect-trace-event` emits `{id,eventId,kind}` only for a current visible event.
Show parent identity, source elapsed time, complete selected JSON and explicit
empty/no-filter-match states. Filtering is controlled, preserves native focus
and never mutates events. Replaced selected event terms fence old feedback;
unrelated appended events do not release the same pending inspection.

## Integration and evidence

Public exports/schemaBySlug, dedicated docs/examples, actual controlled
playground fixtures/reducers, metadata and editable source installation must all
agree. New metadata declares raw result/part/trace details as private UI fields,
no automatic model-context transmission and no direct callsTools. Existing
runtime/server/core/host protocols, package manifests/lock and older specialized
behavior stay fixed. New unit/schema/SSR/browser/consumer checks must verify the
new category, raw JSON states, refusals, real native controls and async fences.
Each old acceptance result retains its source; no historical whole suite is
rerun to support this cohort. New CI, generation, hosting and archive evidence
remain separate, with complete originals and owned cleanup. Storage Guard and
the four non-priority exclusions remain in force.
