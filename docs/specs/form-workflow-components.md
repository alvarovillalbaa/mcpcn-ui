# Five dedicated form workflows

8 November 2026. Owning intent is the complete [MCPCN brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7),
freshly fetched as its unverified 24 August snapshot. Its Forms section names
these five components and requires missing fields, structured-output correction,
required tool parameters and final human context. The source at `5652a906` still
exports them as generic informational aliases. This scope supplies actual form
behavior, not a new form builder, validator service or execution runtime.

Implement MissingDataRequest, MultiStepForm, InlineEditForm, FormProgressCard
and ValidatedFieldList. All 79 catalogue identities remain: 31 specialized and
25 generic components after this cohort. Preserve the existing SchemaForm,
DynamicQuestionFlow, other specialized components, primitives and blocks. New
strict APIs intentionally replace only these five generic aliases. Do not alter
runtime/server/core, protocols, dependencies/lock or styling.

## Shared data and input

New owner modules are `packages/schemas/src/form-workflow-schemas.ts` and
`packages/react/src/form-workflow-components.tsx`, appended after the existing
eighteen copied modules. Use existing primitives and action helpers. Root DTOs
require `id`, `title`; optional `description`, `disabled:false`. Identity strings
are trimmed, nonempty, control-free and at most128 characters. Field identifiers
also refuse `__proto__`, `constructor` and `prototype`. Titles are nonblank/max240,
descriptions max2000, labels max500 and action labels max120. Ordinary display
text permits tab/newline but refuses other ASCII controls and DEL. DTOs and
nested records are strict; collections max100, identifiers distinct/current.
Preserve source array order. Combined parsed JSON is at most256KiB UTF8; skip
serialization if child issues exist. Raw values reuse InspectableJSONSchema
unchanged, including descriptor-safe/getter/finite/size/cycle boundaries.

`WorkflowFormFieldSchema` describes `{id,label,description?,type,required:false,
value?,options?,min?,max?,minLength?,maxLength?}`. Types are `text`, `textarea`,
`number`, `boolean`, `select`, `json`. Present values match their type; text is
max10000, numbers finite, select values are strings matching a supplied option,
JSON supports every bounded primitive/object/array including null/false/zero/empty.
Select requires1..50 distinct `{value,label,disabled:false}` options, nonempty
control-free option values max128; other types forbid options. Numeric min/max
are finite and ordered, number-only. Integer minLength/maxLength are0..10000,
ordered and text/textarea-only. Existing typed values may violate these local
constraints, so a user can correct them; they must not violate basic type/JSON
safety. A supplied disabled option may be displayed but cannot be submitted.
Do not add dynamic regex execution or silently coerce incoming values.

Local drafts preserve raw input and whether a value was supplied. Required
text refuses blank/whitespace; required number0, booleanfalse and JSONnull are
supplied values. Optional explicitly edited text may remain an empty string.
Number/select/boolean placeholders mean absent; explicit Clear controls allow
all kinds to become absent. JSON uses a labelled multiline editor, never HTML:
malformed or unsafe JSON cannot dispatch. A Clear action is distinct from JSON
null and from the JSON empty string. Local numbers are finite and retain their
typed value; numeric controls use step=any. Boolean controls distinguish Not
provided/Yes/No. Validate current values on forward navigation/final submission;
show field-labelled errors, no callback on failure, and focus the error summary
or first invalid control. Do not treat validation as authorization.

JSON editor drafts are at most65536 UTF16 units before JSON.parse, matching the
per-value serialization guard; expose that same native maxlength. Collected
outgoing values and the complete submit/commit envelope each have a256KiB UTF8
budget. Oversized edited data produces a visible validation error and no intent,
including multibyte text and the inline-change wrapper overhead. This is a
prospective input/output constraint, distinct from incoming DTO validation.

Common field parsing/validation helpers may be exported from the new schema
module so React and consumers use the same rules. Do not reuse old
SchemaFieldSchema.value:z.unknown as this new strict contract. Prefer normal
React state; preserve unchanged local drafts through unrelated parent updates,
controlled step changes and newly appended fields. A field with changed
definition or incoming value resets to that current baseline; removed fields
never appear in submitted values. A different root ID resets the form. Meaningful
replacement must fence pending callbacks without discarding unaffected fields.
Pending terminal actions suppress duplicates and disable conflicting edits;
rejection preserves edits and permits retry. Old settled errors must not affect
the replacement operation. No automatic successful-save state is inferred.

## MissingDataRequest

Data: shared root, `fields:WorkflowFormField[]`, `knownFields:[]` default, and
`submitLabel:"Provide information"`, `cancelLabel:"Cancel"` defaults. Every
requested field must initially lack an own value; required flags are explicit.
Known fields are `{id,label,value:InspectableJSON}`, distinct from requested
IDs. Render known context read-only, ask only requested fields, never echo known
values into the submission. Empty requested fields has an explicit nothing-
missing state and disables submission. Added/changed known context does not
discard drafts or release an already pending submission.

- `submit-missing-data`: `{id,values}` contains only currently requested, supplied,
  valid fields. All required requested fields must be supplied.
- `cancel-missing-data`: `{id}`. Cancellation is intent, with no external rollback.

## MultiStepForm

Data: shared root, `steps:[{id,title,description?,fields:WorkflowFormField[]}]`
(1..100), controlled `currentStepId`, labels `nextLabel:"Next"`,
`previousLabel:"Previous"`, `submitLabel:"Submit form"`, `cancelLabel:"Cancel"`.
Step IDs and all field IDs across steps are distinct; at most100 fields total.
Empty steps are valid explanatory pages. Current step must exist. Render an
ordered progress/navigation list, current fieldset and actual navigation.
Back/previous-step navigation preserves even invalid local drafts. Forward
navigation requires every preceding/current relevant step valid; final Submit
exists on the last step and validates every current field across all steps.
Show errors in earlier steps with usable step-navigation controls. Navigation
is controlled; there is no implicit local success if the parent does not accept
the requested step. Native Enter follows Next/final Submit semantics while a
textarea retains normal newlines. Move focus to the new step heading on an
accepted step change, not on every keystroke.

- `change-form-step`: `{id,fromStepId,stepId}` only, no private draft echo.
- `submit-multi-step-form`: `{id,values}` for every current supplied valid field.
- `cancel-multi-step-form`: `{id}`.

## InlineEditForm

Data: shared root, `fields:WorkflowFormField[]`, labels `submitLabel:"Save changes"`
and `cancelLabel:"Cancel"`. Show current typed values in actual editable fields,
including JSON structures; required/local constraints use the common validator.
Save validates current fields and emits only differences from current supplied
baseline. No changed fields disables Save and explicitly says no changes. Clear
is a real removal operation, distinct from setting null/false/zero/empty text.
Cancel deliberately discards local edits back to current baseline and emits its
intent; it does not roll back any external operation. A rejected cancel callback
does not restore already discarded local edits. Empty fields are explicit.

- `commit-inline-edit`: `{id,changes}` ordered by current field order; each change
  is `{fieldId,op:"set",value}` or `{fieldId,op:"clear"}`. No unchanged field echo.
- `cancel-inline-edit`: `{id}`.

## FormProgressCard

Data: shared root, `status:"not-started"|"in-progress"|"complete"|"blocked"`,
optional `progress:{completed,total}` (nonnegative safe integers, completed<=total),
`steps:[]` default of `{id,label,status,progress?}`, optional controlled
`selectedStepId`. Total0 is permitted. Report supplied progress/status faithfully;
100% is not inferred completion. Native progress has an accessible name; absent
counts stay unknown rather than invented. Empty steps are explicit. Selected ID
must be current. No timer, wizard mutation or invented validation result.

- `select-form-progress-step`: `{id,stepId}`.
- `inspect-form-progress`: `{id}`.
- `inspect-form-progress-step`: `{id,stepId,status}` for the current selection.

Progress-only updates and unrelated appended steps preserve pending inspection;
replaced selected terms fence old settlements. Disabled/busy prevents actions.

## ValidatedFieldList

This is a review of consumer-reported validation; InlineEditForm owns editing.
Data: shared root, `fields:[{id,label,value?,status,message?,validatable:false}]`,
controlled optional `selectedFieldId`. Status is `unvalidated|pending|valid|invalid`.
Values are bounded InspectableJSON. Valid requires a value; invalid requires a
nonblank message. A message is otherwise optional. Pending/unvalidated may lack
a value; their explicit absence differs from null/false/zero/empty. Validatable
is allowed only for unvalidated/invalid fields with supplied values. Preserve
order and show all reported statuses/messages; do not turn those into a promise
of server safety. Selected ID must exist. Empty fields are explicit.

- `select-validated-field`: `{id,fieldId}`.
- `inspect-validated-field`: `{id,fieldId,status}` for current selection.
- `validate-field`: `{id,fieldId}` only if currently eligible. The consumer looks
  up/validates its own supplied value; raw value is not automatically forwarded.

Use real field-specific controls, selected value inspection and complete JSON
disclosure. Unrelated append preserves pending validation; changed selected
terms/eligibility fences prior settlements. Rejected callbacks visibly recover.

## Integration, visibility and evidence

Public props keep onAction/busy/error/className outside strict DTO parsing.
Editable forms' explicit submit/commit intents carry human-reviewed supplied
values, which remain private UI input until a consumer deliberately handles or
forwards them. Metadata describes exact IDs/navigation/reported state as
model-visible and raw fields/known values/drafts/messages as private; callsTools[]
and destructive:false. Metadata does not remove data already supplied to a model.
No component calls tools, sends messages/context, accesses storage/network/
clipboard, changes permissions or launches timers.

Add controlled docs examples, meaningful complete copyable consumer snippets,
five playground fixtures, schema metadata and dedicated rendering. Demos accept
navigation synchronously and terminal intents with Immediate/Delayed/Reject
responses; retain actual intent/settlement counters and replacement/append
controls for race proof. Timers belong only to disposable demo consumers and
must be cleaned up. Use authored values, no private or production data.

Regenerate canonical JSON only through its existing owner in isolated CI. All
167 generated paths,20 source modules,24/25-file component/block payloads,
79 item/index pairs and 31/25 counts must be verified. Fresh package/copy
consumers should write80/103 files; verify actual counts before freezing CI.
The new packet needs its own literal unit/SSR tests and desktop/narrow iframe/
direct form scenarios, without historical packet reruns. Source cap2500 is set
prospectively because current baseline has1685 files; old1500 is insufficient.
All process/stream/source/cleanup gates retain accepted semantics. Concrete
controller, limits and exact counts must be published before activation.
The aggregate registry index alone has a32MiB read/HTTP bound for repeated
twenty-module payloads (baseline14,071,107B); ordinary native files remain16MiB.
The editable installer's cumulative declared-source bound is32MiB for this
expanded catalogue. It still counts repeated shared source before deduplication;
each item JSON and each source file retain their2MiB limit. Deadlines, path and
conflict checks, transactional writes and cleanup remain unchanged.

Storage Guard currently fails24.9GiB/34GiB required: no local install/build/app/
test suite/server/browser. Static source parsing and bounded data handling are
separate. Standing owner approval authorizes focused free public CI and existing
GitHub/Vercel publication; no new account/paid plan/model/provider call/npm
publication or production authorization change belongs to this scope. Keep
accepted runtime/registry/hosting fixed until this source/output passes. Preserve
all historical receipts and other unfinished library/portfolio requirements.
