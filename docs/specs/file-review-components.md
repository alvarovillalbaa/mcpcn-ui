# Document preview and file review

Status: implementation contract, 2026-11-08. Checks and public delivery are pending.

Owner: the [uis brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7), read in full on 2026-11-08. It names DocumentPreview, FileReview and file-upload-and-extract, and describes contract/invoice/resume extraction with confidence, evidence, corrections and save confirmation. The page is marked unverified and was last edited 2026-08-24; no newer intent is inferred. GitHub remains the implementation truth.

## Boundary

Replace only the DocumentPreview and FileReview generic aliases. Preserve all 79 catalogue identities and the existing FileUploadAndExtract native `File` API: `extractedFor === file` is still object identity, never a metadata comparison. No automatic file read, parser, OCR, upload, fetch, tool call or persistence is added. A consumer supplies representations and owns conversion, access, extraction, correction state and saving. A displayed representation, reported confidence or matching ID does not verify original bytes or extraction accuracy.

The new source modules are `packages/schemas/src/file-review-schemas.ts` and `packages/react/src/file-review-components.tsx`. Strict DTOs exclude UI callbacks, `busy`, `error` and `className`; React removes those properties before validation. Export input and parsed types, named schemas, and typed view/review intents.

## Data

`ReviewFile` is `{ id, revision, name, bytes, mimeType? }`. IDs/revisions are trimmed nonblank strings of at most 128 characters without control characters. Names are nonblank plain text at most 500 characters; MIME hints at most 120. Bytes are a nonnegative safe integer, including zero. All are consumer-reported.

DocumentPreview data is `{ id, title, description?, file, state, content?, message?, selectedPageId?, sources?, selectedSourceId? }`. Titles are nonblank plain text up to 240 characters; descriptions/messages up to 2000. State is `loading | ready | empty | error | unsupported`. Only ready has content, sources or selections; ready requires content. Error and unsupported require a message. Other states remain explicit useful render states. The complete parsed DTO is at most 2 MiB UTF-8 JSON.

Content is exactly one of:

- `{ type: "text", text }`: full text, including an explicitly empty string, at most 65536 UTF-16 units.
- `{ type: "json", value }`: the existing descriptor-safe InspectableJSON guard, including null/false/zero, with its existing finite/depth/container/string/serialized bounds unchanged.
- `{ type: "pages", pages }`: 1–20 ordered pages `{ id, label, text?, image? }`, each with full text, an image, or both. Empty text is a supplied representation. Page IDs are unique. Page text has the same 65536-unit limit.

An image is `{ mimeType, base64, width, height, alt }`: PNG, JPEG or WebP only, canonical base64, at most 256 KiB decoded per image and 1 MiB decoded collectively, dimensions 1–4096 per side and at most 8 million pixels, nonblank alt up to 2000 characters. Check the format signature/header dimensions against the declaration before rendering. This is bounded header validation, not complete image decoding or original-file proof. Browser decode failure is visible and retains supplied text. SVG, HTML, arbitrary image URLs, PDF objects/iframes and scripts are not rendered. Only the selected page image is mounted. Raster data URLs fit the unchanged local-service CSP.

Header layout references inspected for this implementation: [W3C PNG IHDR](https://www.w3.org/TR/png/#11IHDR), [Google WebP container](https://developers.google.com/speed/webp/docs/riff_container) and the [libjpeg-turbo marker reader](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jdmarker.c). These inform bounded header checks; they do not establish complete decoder conformance. The full ITU T.81 text was not read.

Sources are at most 20 unique `{ id, label, text, pageId? }` snippets; text up to 4000 characters, labels up to 500. A page reference must exist; page selections require paginated content and a current page ID. Source selections must be current. No external source URL is needed for these page links.

FileReview is `{ id, title, description?, file, preview?, extraction?, disabled?, confirmLabel?, confirmationLabel? }`; file may be null. Null file cannot carry preview/extraction. Preview is DocumentPreview data. Extraction is `{ id, revision, fileId, fileRevision, fields }`. Fields reuse the existing ExtractedFieldsReview semantics: up to 100 unique safe IDs (120 characters), string original/current values up to 4000, required/disabled flags, reported confidence 0–1 and up to 20 unique safe HTTP(S) evidence entries per field. The new nested DTOs are strict. The complete FileReview DTO has the same 2 MiB bound, not two independent budgets.

Different preview/extraction file identities are representable as stale input: show a clear mismatch, hide foreign content/fields and disable review/save. A supplied preview's complete file descriptor must equal the current descriptor. Saving requires a matching ready preview, a matching extraction, at least one field and all required values nonblank. Absent/loading/unsupported preview and absent/empty extraction remain visible non-saveable states.

## Interaction

DocumentPreview provides full text/JSON inspection, a labelled scroll viewport, native page selector, Previous/Next, page count, source-to-page selection, and fit/zoom controls for images. Navigation is local when selection props are absent, and controlled when supplied; it never requires a tool. Controlled navigation emits identity-only `document-page-change` or `document-source-change` intents with `previewId`, `fileId`, `fileRevision` and page/source IDs. Selecting a source that names a page selects that page through the same local/controlled ownership. No optimistic controlled selection is invented. No content is added to view intents.

Preserve local page/zoom/source state while its current content remains unchanged, including unrelated appends. Reset relevant view state on current content/file revision replacement. Native controls, readable full content, focus visibility, narrow-screen containment, reduced motion and dark/contrast themes use existing primitives/CSS. Navigation must not steal focus on initial render; keyboard activation moves focus only where useful and announced. No incomplete custom tab/modal pattern is introduced.

FileReview composes DocumentPreview and ExtractedFieldsReview. Corrections remain caller-controlled. Wrap field changes as `file-correction-change` with `{ reviewId, fileId, fileRevision, extractionId, extractionRevision, fieldId, value }`. The existing child confirmation button reviews the exact current corrections locally; it does not save. Then show an unchecked explicit confirmation and a separate Save button. `save-file-review` carries the same scope plus only current declared `values`. Private content never appears in unrelated view intents.

Consent binds the full current file descriptor, preview content/provenance, extraction identity/terms and corrected values. Any meaningful change invalidates reviewed/confirmed state; selection/zoom-only navigation does not. Preserve controlled corrections on rejection and unrelated appends. Replacement unmounts/fences old pending callbacks; double submission is suppressed. Callback settlement never invents an extracted/saved result. Use the existing action helper; no changes to old component behavior are needed.

## Integration and privacy

Add dedicated catalogue descriptions, strict schema registration, source ownership, React dispatch, compact fixtures, substantive component docs/demos, and a caller-owned extraction example. Generated registry/package bytes are owner-generated only in isolated CI and adopted only after the complete new packet passes.

PrivateOnly metadata explicitly covers filename/MIME, text/JSON/images, snippets, extraction evidence, original/corrected values, drafts and saved values. IDs/status alone may be model-visible; metadata does not hide anything already supplied to a model. Existing playground model-context sharing remains explicit and unchanged. Do not change editor/host/CSP limits: the editor still permits 8192 UTF-16 units per string and 65536 total UTF-8 result bytes, so compact authored fixtures fit that smaller envelope. Document native component limits separately.

## Verification and scope

Use only new focused schema/React/fixture/registry/docs cases, desktop/narrow Chromium scenarios and fresh package/source-copy consumers. Reuse the accepted finite process ownership helper and its explicit 12 fixture prerequisites without relabelling them as new product cases. Closed form packets and older product suites stay closed. Run in one temporary public GitHub job capped at 20 minutes, with no retries, real data, account, model call, provider access, new paid plan or production persistence. No local install/build/server/browser work while Storage Guard is below reserve. Freeze exact case inventories and transport/source budgets in the new checks proposal before dispatch.

Real external MCP hosts, original-byte fidelity, real OCR/parsing, physical devices, remote saving and production tool invocation remain outside this representation-and-intent contract.
