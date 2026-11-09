# Source selection and evidence inspection

Implementation contract, 8 November 2026. Base: `8a9cd4bb70502894a5e31851e03c5651c4d7b75b`, tree `45fbc814134140f585c700a59a811531e12437ae`. The [uis brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7) names SourceList and EvidenceDrawer under trust/audit, for understanding assertions and their supplied sources. The current fetch still reports the unverified24 August2026 edition; no newer intent is inferred. Existing [file-review delivery](../results/2026/11-08/file-review-public-delivery.md) stays closed.

## Ownership and boundary

Replace only the two named generic aliases with strict DTOs and dedicated React UI. Preserve all79 identities,33 existing specialized implementations,21 other generic aliases and11 blocks. Target35 specialized components,21 generic aliases,24 copied owner modules and28 component/29 block payload files. New modules are `packages/schemas/src/source-evidence-schemas.ts` and `packages/react/src/source-evidence-components.tsx`.

Reuse the existing SourceEvidencePanel source shape for its ID/label/safe URL/excerpt/support rules, `InspectableJSONSchema` for guarded JSON, and `stableReviewKey` after parsing for canonical term comparison. Keep all old schemas, SourceEvidencePanel, public Dialog, runtime/server/core, host protocols, dependency versions and lockfile unchanged. Add only scoped source/drawer CSS. Do not fetch, verify, rank or persist evidence, send model context, execute tools or infer source truth. A URL is an explicit user link, never an automatic request.

## Strict data and intents

Export input and parsed types for the following schemas. All objects are strict. Root identity/revision are trimmed nonblank control-free strings of at most128 characters. Root title is visible plain text at most240; optional description at most2000. Complete parsed DTOs fit2MiB UTF-8 JSON; do not serialize already-rejected unsafe JSON to measure it.

- `EvidenceSourceSchema`: existing source shape `{id,label,url?,excerpt?,supports:[]}` plus required `revision`. Preserve the current limits: label500, absolute credential-free HTTP(S) URL2048 without control/space characters, nonblank excerpt5000, at most20 nonblank support strings of500 each. Do not widen or mutate the old source contract.
- `EvidenceContentSchema`: discriminated `{type:"text",text:string<=65536}` or `{type:"json",value:InspectableJSONSchema}`. Preserve complete supplied text, escaped markup, nested JSON and `null`/`false`/zero/empty values. No slicing, HTML interpretation, image/PDF conversion or network loader.
- `SourceListSchema`: common root `{id,revision,title,description?}` and four states. Ready has `sources` (0–100, unique source IDs), optional message and `selectedSourceId?:id|null`. A non-null selected ID must identify a current source. Loading/empty have optional message; error requires a nonblank message. Non-ready states forbid sources and selection so stale values cannot render.
- `EvidenceDrawerSchema`: common root plus optional `open?:boolean`, with no default. Ready requires exactly one source descriptor and content, with optional message. Loading/error may identify the intended source but forbid content; error requires a nonblank message. Empty has no source/content and optional message. Preserve absence of `open`.

React separates `className`, `busy`, `error` and `onAction` from the strict DTO before validation. Export identity-only intents: `select-source`/`inspect-source` with `{listId,listRevision,sourceId,sourceRevision}`; `open-evidence`/`close-evidence` with `{drawerId,drawerRevision}` and the current source ID/revision pair when one is present. Notifications never include labels, URLs, excerpts, support text or content. Registry security exposes only root/source identities/revisions/state and current selection; text, URLs, content, messages and local presentation state remain private. Both components have `callsTools:[]` and `destructive:false`.

## Selection and callback ownership

SourceList treats `selectedSourceId !== undefined` as caller-controlled, including explicit null. It emits selection intent and waits for the caller's value; without a callback, controlled selection controls are read-only. Without a supplied selection it keeps local selection, initially none; an optional callback reports that local choice. Inspect emits only current identity and requires a callback. No callback is required to use local selection or native safe links.

Root lifecycle is keyed by ID/revision. Local selection and callback ownership are additionally scoped to the meaningful current source descriptor, not the full source array. Current-source removal/revision/content replacement clears local selection and fences prior pending/error state even if the producer forgot a revision. An unrelated append/reorder or equivalent object-key reorder preserves current selection, native control node/focus and pending state. A rejected callback does not fabricate success or discard a local choice. Repeated pending identical actions are suppressed. Invalid data renders a visible failure and cannot emit an old intent.

## Modal presentation and dismissal

Use a component-scoped native `<dialog>` promoted through `showModal()` after hydration. SSR must omit the native `open` attribute; keep a scoped closed-dialog display rule and no false nonmodal/modal flash. A visible heading labels the dialog; focus that heading (`tabIndex=-1`) for complete structured evidence. Do not put `tabindex` on `<dialog>` or set document-global `aria-hidden`, body locks or a new global focus manager. The browser supplies native modality/inertness within the current document; an iframe does not make its parent host inert. See the [HTML dialog contract](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) and [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

`open` is an external presentation request with owned user dismissal, not an undismissible controlled modal:

- Absent: local mode, initially closed, usable without a callback.
- False: externally closed. An Open control may emit an opening request if a callback exists; it does not open until a true request arrives. Without that callback the controlled opening control is disabled.
- True: initial/new-root true, false→true, or newly supplied true after absence is consumed as an opening request. Unchanged true never reverses an explicit user dismissal on an ordinary render. The drawer's own Open control may explicitly reopen a consumed true request.

Close, Escape and a genuine backdrop pointer-down/up close immediately, even while external busy or a callback is pending, absent, ignored or rejected. Optional callbacks report the view event; they never authorize dismissal. Use separate presentation-cycle/current-content ownership for notification settlement: an old resolution/rejection cannot reopen a drawer, relabel a replacement, clear new feedback or modify a new scope. Catch rejections; show truthful current notification failure separately from presentation success. Programmatic/native close events must not emit duplicate close notifications. External closing and unmount do not fabricate user actions.

Keep the native shell stable across ordinary renders. Root replacement resets local presentation and honors the new root's explicit request. Same-root meaningful source/content/state replacement closes the old presentation, clears disclosures/feedback and fences callbacks; an unchanged already-consumed true does not reopen it. Equivalent JSON key order and unrelated list append preserve presentation. Callback availability changes fence old notification feedback without resetting valid selection/presentation; inline callback function identity alone does not define a new scope.

Capture an owned Open trigger before dispatch can disable/blur it. For external opening capture active focus at actual promotion. On close restore a connected usable invoker; do not focus a removed, hidden, disabled or inert node or steal focus from another active modal. Native stacking must work for two instances. Close/unmount must release the top layer and fence queued old close events, including StrictMode cleanup/reopen. If modal APIs are missing/fail, stay closed and show a visible failure; never claim modality from attributes alone.

The retained second invocation showed native sequential Tab navigation leaving
the child iframe after reaching its final stop. Add a key handler only to this
real native dialog: for unmodified Tab/ShiftTab while open and actually modal,
recompute its own connected, visible, enabled, non-inert tab stops. Wrap at the
first/last boundary and enter from the initial non-tabbable heading; leave middle
navigation to the browser. Exclude controls hidden by closed details. Do not add
document listeners, make the host inert, change global Dialog, or reacquire focus
from the host after an escape. Native top-layer modality remains required.

Render complete content in a bounded scrollable body; keep the header/Close control usable and narrow layouts contained. Excerpts/supports and URLs are supplied claims, not verified evidence. Long strings/JSON remain fully inspectable without horizontal page overflow.

The labelled, tabbable evidence body owns vertical reading. Its text/JSON PREs
must not create a separately capped inner scroll area. Override only those PREs
with `.mcpcn-evidence-dialog .mcpcn-evidence-content pre` using max-height:none
and overflow:visible; this scope outranks the later playground frame PRE rule.
Keep the native shell, header, focus/dismissal behavior and all unrelated PREs
unchanged. A user who Tabs to the body must be able to use End to reveal the
final supplied marker, and Home to return, while the complete content remains.

## Integration and acceptance

Wire named exports/schema dispatch, catalog security, the two appended copy modules, authored fixtures, docs previews and real controlled examples. Preserve old blocks unless a real call site requires adapting to the new typed source contract; inspect before editing. No manual generated-registry edit.

For these two slugs only, preserve the frame/preview component identity by kind/root ID/revision across ordinary producer updates. Do not put their controls inside the older preview's disabled fieldset or global pending-action gate: the drawer owns immediate dismissal and callback fencing. Invalid envelopes unmount their previous content. Other slugs keep their existing remount and feedback behavior. `frame.tsx` is the sole additional protected-file admission; `editor.ts`, host-session and protocol remain unchanged.

The playground keeps its existing smaller editor bounds:8192 UTF-16 units per string,65536 UTF-8 bytes per result,4000 structural nodes/depth16 and arrays of at most100. Reject oversized input; never truncate it. For these two slugs only, the descriptor-safe fixture guard permits schema-owned URL keys and JSON keys named url/href as data; all prototype/accessor/cycle/symbol/budget protections remain. Source URLs still pass the strict HTTP(S) schema. Native component limits remain2MiB per DTO/text65536 and the existing guarded JSON1000-node/depth8 contract. Complete native examples and tests must not misrepresent the playground's smaller surface.

The app frame's existing collapsed state diagnostics may expose a `Received
evidence payload` preformatted view for only these two successfully validated,
ready, non-error envelopes. It shows the current validated envelope, including
the existing optional stateVersion, without publishing model context or changing
component keys/data semantics. It helps developers distinguish receipt of a new
producer result from the component's meaningful-term comparison. Equivalent
JSON object-key order need not rewrite the viewer's existing text order.

The [focused proposal](../proposals/evidence-review-checks.md) owns new tests and finite remote resources; actual counts/source hashes must be frozen before dispatch. Browser proof must establish real modal focus/dismissal/stacking behavior; SSR alone cannot do so. Physical devices, all assistive technologies, external MCP hosts, source verification and remote persistence remain separate unverified boundaries.
