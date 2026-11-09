# Supplied conflict choices and validation reports

Replace only ConflictResolver and ValidationSummary generic aliases after clean
36129be78ef310545930e0fa9e92ae2aa65b2f06/treea868f399. The retained Notion brief
names both in data-review workflows but does not specify a resolution policy.
The following is the concrete product contract chosen under standing owner
authorization. Preserve all79 identities, eleven current blocks and existing
table/extraction/file/evidence/inspection contracts. HumanCorrectsAiOutput
currently renders ControlledForm; its catalogue advertises ValidationSummary,
but this scope does not claim or change an existing summary composition.

## Strict supplied data

New conflict-validation-schemas.ts and conflict-validation-components.tsx own
the pair. Reuse safe120 identities, visible300 labels, bounded plain text,
InspectableJSONSchema, current extracted-field evidence and stableReviewKey.
Descriptor-safe outer preflight rejects accessors, foreign prototypes, symbols,
cycles and sparse arrays before nested parsing; complete parsed DTOs fit2MiB
UTF8 JSON. No unknown properties or silent value truncation. Keep existing
per-value JSON bounds and safe HTTP(S) evidence-link rules unchanged.

Both roots require id,revision,title, optional description and discriminated
state ready/loading/empty/error. Non-ready states have no payload or selection;
error requires a nonblank message. Optional ready/loading/empty message is plain
text. Local selection starts null. An absent selection property means local;
null means controlled none; a current member ID means controlled selection.
Preserve property absence; reject a selection not present in the current list.

ConflictResolver ready has conflict{id,revision,label,candidates} and optional
selectedCandidateId/message. Candidates contain2–20 unique IDs and each uses
the existing InspectionField shape: id,revision,label, complete JSON value,
optional finite0..1 confidence and up to20 uniquely identified evidence objects.
No candidate is a default winner. Equal candidate values are permitted; their
identities still differ. Selected confidence/evidence are supplied claims.

ValidationSummary ready has report{id,revision,label,reportedStatus,issues} and
optional selectedIssueId/message. reportedStatus is exactly unknown/pending/
valid/invalid and is always attributed to the supplied report. Issues contain
0–100 unique IDs. Each strict issue requires id,revision,label, severity
info/warning/error and a nonblank plain message (max4000), with optional context
as complete InspectableJSON and the same evidence list. Missing context differs
from null/false/zero/empty. Status is independent of issue count/severity;
inconsistent supplied reports remain visible without inferred corrections.

## Interactions and feedback

Use labelled regions and real keyboard-operable member buttons with current
aria-pressed. Lists display labels/types and supplied confidence or severity;
the selected panel displays complete escaped JSON/message/evidence in one
labelled tabbable scroll body without a nested PRE trap. Native confidence
meters display supplied0..1; absent differs from0. Explicit links alone navigate
with existing safe attributes. No automatic fetch, clipboard, validation or save.

Conflict selection and Clear are separate from an explicit Confirm choice
button. Local selection/clearing works immediately without a callback and while
busy or a notification is pending. Controlled requests wait for producer data;
disable them if callback absent. Confirm needs a current selection, callback,
not externally busy and no current confirmation pending. It emits identity-only
intent, never marks a conflict resolved, persists a choice or grants authority.
Successful callback settlement means only that the request completed. Switching
or clearing selection remains possible while confirmation is pending.

Conflict intent types are select-conflict-candidate, clear-conflict-candidate
and confirm-conflict-candidate. All include componentId/componentRevision and
conflictId/conflictRevision; select/confirm additionally include candidateId/
candidateRevision. Validation intents are inspect-validation-issue and
clear-validation-issue, with componentId/componentRevision and reportId/
reportRevision; inspect additionally includes issueId/issueRevision. No value,
label, message, severity, confidence, evidence or URL appears in an event.
Only explicit controls emit; external selection/data changes do not.

Use root and conflict/report identity for scope. Local choice survives unrelated
append/reorder/member changes. Removal or meaningful selected-member replacement
(revision/label/value/confidence/evidence or issue severity/message/context),
root or conflict/report replacement clears local choice and fences all obsolete
feedback. Equivalent JSON object-key order is not replacement. Controlled
selection remains producer truth. A requested member is fenced before producer
acknowledgement too. Separate confirmation feedback from selection notification;
late promise settlement cannot change selection, show old errors or imply
resolution. Callback-availability and unmount changes also invalidate old work.
Current failure shows a generic retryable error; never automatically retry.

## Integration and focused acceptance

Append one schema and one React module to the existing26-module copied closure:
28 modules,32/33 component/block files,80/111 installed consumer files and109
copied TypeScript files. Actual wired source becomes39 specialized/17 generic.
Provide package exports, strict registry schemas/privacy metadata, authored
docs demos and shared-iframe fixtures. Preserve all runtime/server/core/host
protocol/CSP/primitives/dependencies/lock and old controller/evidence bytes.
New CSS is scoped and append-only. Seed only the new slugs through existing
descriptor-safe controlled DTO routing if required by current editor bounds.

Prospective authored units are40 schema,32 React,10 fixture,8 registry and10
docs cases (100 total), with12 separate unchanged ownership prerequisites.
Freeze actual literal identities, browser stage/DOM/read counts and full source
hashes before one bounded remote focused packet. New twelve desktop/narrow
cases cover local/controlled choice versus confirmation, complete/falsy JSON,
reported status independent of issue severity, selected-member/replacement/late
callback fences and all explicit states. Two fresh strict installed consumers
must render both new exported components and actual copied implementations.
Do not replay closed inspection or other packets as acceptance.

Keep prospective5000-source-file/96MiB seed and exact raw source-guard Git tree
stdout1MiB limits only if fresh measurement fits; other streams remain512KiB.
No ownership/signalling/closure/cleanup changes. Standing owner approval covers
free focused remote CI and personal publication. Storage Guard continues to
forbid local heavy runtime. No new account, paid plan, provider/model call,
authorization change or public npm publication belongs to this scope.
