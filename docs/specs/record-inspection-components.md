# Record and field-confidence inspection

This scope replaces only the RecordInspector and FieldConfidenceList generic
aliases. It follows accepted evidence delivery49c730b1 and preserves all79
catalogue identities, eleven blocks and existing public component contracts.
Product intent is the retained Notion MCPCN data-review brief, including
imported records, extracted invoice fields and supplied confidence/evidence.
Neither alias currently has a direct block caller; do not claim an existing
composition was adapted. Existing extraction, table and file-review behavior
stays unchanged.

## Public data

`record-inspection-schemas.ts` owns strict new DTOs and identity-only intents.
Use existing safe120-character decision identities, visible300-character
labels, bounded plain descriptions/messages and the unchanged
`InspectableJSONSchema` for complete values. Reuse the existing extracted-field
evidence shape and safe HTTP(S) URL rules, with strict evidence objects and
unique evidence IDs. Unknown fields are refused throughout the new DTOs.

An InspectionField has required id, revision, label and value. Value is complete
bounded JSON, including null, false, zero, empty string and nested arrays/objects.
Confidence is optional finite0..1; absent differs from zero. Evidence is a
maximum20-item supplied list (default empty), with id, label and optional text
and safe URL. No inferred confidence, threshold, verification or authenticity.

Both component roots require id, revision, title, optional description and a
discriminated state ready/loading/empty/error. Non-ready states have no data or
selection; error requires a nonblank message. Ready permits optional message.
RecordInspector ready has record{id,revision,label,fields}; FieldConfidenceList
ready has fields directly. Lists contain at most100 unique field IDs. A ready
empty array has an explicit no-fields state. Parsed DTOs must collectively fit
2MiB UTF-8 JSON, checked only after safe nested parsing. No getters, prototypes,
cycles, omitted JSON values or silent truncation may reach rendering.

Ready selectedFieldId has three meanings: absent uses component-local current
field; null is controlled with none selected; a current ID is controlled
selection. Preserve absence in parsed output. Start local selection at null.
External selection changes never emit an intent. Reject unknown selections.

## Interaction and replacement

Render a labelled region, field labels and types, and a clearly labelled full
value/evidence panel for the selected field. State that selection is required
to inspect complete values; never present a truncated value as the complete
record. RecordInspector also displays the supplied record label; the confidence
list emphasizes reported confidence, with a labelled native meter for supplied
values, textual0% for zero and explicit "Not supplied" when absent. Confidence
has no authorization/validity/completion meaning. No average or risk threshold.

Each field has a real keyboard-operable button with current aria-pressed state.
In local mode it immediately selects that field even without onAction; a Clear
selection button immediately clears locally. Controlled mode emits a request
and waits for a producer selection update. Disable controlled requests if no
callback exists. Busy/pending notification never prevents local reading or
switching fields. Full selected JSON and evidence remain React-escaped, readable
without an independent nested PRE scroll trap. Explicit links alone navigate;
use the existing safe external-link attributes. No auto-fetch or clipboard.

Use stable root/component identity and record identity for scope. Local choice
survives append/reorder or changes to another field. Removal or any meaningful
selected-field replacement (revision/label/value/confidence/evidence), root or
record replacement clears local choice and invalidates old notification
feedback. Controlled selection remains the producer's current truth. Equivalent
JSON object-key order is not a replacement; use the existing canonical key.
Keep the root shell stable for semantic refresh; do not remount by full payload.

Only explicit buttons emit inspect-record-field/inspect-confidence-field or
clear-record-field/clear-confidence-field. Data includes componentId,
componentRevision, fieldId/fieldRevision when selected; recordId/recordRevision
are required for RecordInspector intents only. Clear has no field identifiers.
Never include value, label, confidence, evidence, description or URL in events.
Use current rendered identities, never stale captured fields. A current
notification failure shows a generic error. Promise settlement from a prior
root/record/member/selection/callback-availability scope cannot change current
selection, disclose values or show stale feedback. No automatic retry.

## Integration and proof

Append one schema and one React owner module to the existing24-module copied
closure. New counts are26 modules,30/31 component/block payload files and
80/109 installed consumer files. Preserve public package/style exports, runtime,
server/core, host sessions/protocols/CSP, dependencies/lock, primitives and all
closed contracts/controllers/evidence. Scope any new CSS to these two views.
Catalogue is37 specialized/19 generic only after actual new source is wired.

Provide authored docs examples and controlled demos, shared iframe fixtures and
previews, strict registry JSON Schemas/security metadata, complete package and
editable-source imports. New fixtures cover falsy/nested values, zero/absent
confidence, safe evidence, controlled/local selection and all explicit states.
Keep existing shared editor limits; seed only these two new slugs through safe
descriptor-based preflight followed by strict schema parsing, if needed.

Freeze the literal new unit identities and browser stages before executing the
new focused packet. Use real keyboard/controls, complete DOM and identity-only
intents, replacement/late-callback fences, desktop/narrow views, direct docs and
actual installed SSR. Keep closed90/12/2 evidence acceptance unchanged. The
unchanged12 ownership fixtures remain a separately declared prerequisite.

Current source4137 files/raw Git tree547551 bytes exceeds closed controller
4000/524288 limits. Declare new finite source5000 and specifically named raw
Git tree1MiB stdout bounds before this packet; retain every full hash/read/identity
guard. Current seed export is71867703bytes, so declare96MiB before creating
the new export. All other command streams retain512KiB, including Git stderr.
The accepted normalized process block includes stream capture, so a new explicit
exception for exact source-guard `git ls-tree -r -z HEAD` and BASE stdout is
necessary. Record that narrow source difference honestly; ownership, signals,
deadlines, terminal/pipe closure and cleanup code otherwise stay byte-identical.
Generated
adoption, release archives, hosted build and public HTTP need their own actual
receipts. Storage Guard forbids local installs/builds/app tests/browsers/servers.
Standing owner approval covers focused free remote CI and personal publication;
no new paid plan, account, model call, auth grant or production data.
