# Five approval components

This cohort advances the [owning library brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7)
with five dedicated approval workflows. It does not complete the full catalogue:
the other 35 generic aliases retain their identities and honest implementation
status. Existing review, decision and execution components remain separate.

The schemas live in `packages/schemas/src/approval-schemas.ts`. Public package
exports and `schemaBySlug` expose all five. Each has an input `*Data` type and a
`Parsed*Data` type reflecting applied defaults. Schema and UI checks authored
for this cohort are **unrun** until the new remote packet supplies evidence.
No local Node, application, test, install or build is authorized below Storage
Guard's reserve. Historical passing packets are not this cohort's acceptance.

## Shared data and intent boundary

All five require `reviewId` and `title`; `description` is optional. IDs are
nonempty, trimmed, control-free strings of at most 128 UTF-16 code units.
Titles are nonblank up to 240 units; descriptions up to 2,000. Other visible
labels are nonblank up to 500, and action labels up to 120. Ordinary text may
contain tabs/newlines, but other ASCII controls and DEL are refused. Unknown
payload properties and unknown nested item properties are refused.

`disabled` is a boolean defaulting to `false`. It gates consumer intents; it
does not change authorization. Shared React `busy`, `error`, `className` and
`onAction` props are UI/callback inputs, not schema payload properties. Busy,
disabled and missing-callback states must prevent every action callback.

Collections contain at most 100 entries. Entry IDs are unique within their
collection; controlled selection IDs are unique references to current entries.
An incomplete checklist or scope selection is valid display state. The action
gates below determine readiness; parsing never preapproves a review.

These components emit consumer intents only. They do not call tools, submit
forms, delete objects, override a backend decision, grant/deny real permissions,
change policy, authenticate, send network requests or echo submission values.
The consumer independently validates and executes any requested operation.

## Data contracts

| Component / slug | Required workflow data | Controlled state |
| --- | --- | --- |
| `ApprovalChecklist` / `approval-checklist` | `items: {id,label,description?,required?}[]`, one to 100 items, at least one required | `checkedItemIds`, default `[]` |
| `BeforeSubmitConfirmation` / `before-submit-confirmation` | `fields: {id,label,value}[]`, one to 100 fields | None; consent stays local |
| `DestructiveActionGuard` / `destructive-action-guard` | `targetLabel`, `summary`, `affectedCount`, `confirmationText`; optional `rollback` | None; phrase and consent stay local |
| `HumanOverridePanel` / `human-override-panel` | `recommendation`, `options: {id,label,description?}[]`, two to 100 options, current `recommendedOptionId` | Optional current `selectedOptionId` |
| `PermissionRequestCard` / `permission-request-card` | `requester`, `purpose`, `scopes: {id,label,description?,required?}[]`, one to 100 scopes, at least one required | `selectedScopeIds`, default `[]` |

Checklist items and scopes default `required` to `true`. The optional flags
cannot make an entirely optional checklist/request valid. `summary`, `purpose`,
`recommendation`, item/option/scope descriptions and `rollback` are bounded to
2,000 units. `targetLabel` and `requester` use the 500-unit label bound.

Submission `value` is exactly a string, finite number, boolean or `null`.
Strings are bounded to 5,000 units and preserve empty/whitespace-only values;
zero, `false` and `null` remain distinct. Missing values, objects, arrays,
`NaN` and infinities are refused. No numeric/date interpretation is introduced.

`affectedCount` is a positive safe integer, from 1 through
`Number.MAX_SAFE_INTEGER`; zero, fractions, unsafe integers and nonfinite values
are refused. `confirmationText` is a nonblank single-line phrase up to 120
units, without leading/trailing whitespace. Matching is exact and case-sensitive.

## Labels and local review state

| Component | Default action labels | Other default labels |
| --- | --- | --- |
| Checklist | `approveLabel: "Approve checklist"`, `cancelLabel: "Cancel"` | No separate consent checkbox |
| Before submit | `submitLabel: "Submit"`, `cancelLabel: "Cancel"` | `consentLabel: "I reviewed these fields and want to submit."` |
| Destructive guard | `confirmLabel: "Confirm destructive action"`, `cancelLabel: "Cancel"` | `consentLabel: "I understand this action and want to continue."` |
| Human override | `overrideLabel: "Override recommendation"`, `cancelLabel: "Cancel"` | `reasonLabel: "Reason for override"`; `consentLabel: "I reviewed this override and want to apply it."` |
| Permission request | `requestLabel: "Request permission"`, `denyLabel: "Deny permission"` | `consentLabel: "I reviewed these scopes and want to request permission."` |

Consent, the typed confirmation phrase and the override reason are local UI
state, never payload defaults. Before submit requires fresh local consent.
The destructive guard requires both the exact local phrase and fresh consent.
Override requires a current alternative distinct from the recommended option, a nonblank local reason bounded
to 2,000 units and fresh consent. Permission requests require fresh consent and
all required scopes selected; selection must contain at least one scope.

Controlled selection updates do not replace the review's local editing state.
Changing the selected override option or permission scopes clears final consent
while retaining local reason/focus. Replacing review terms resets all local
consent, phrase, reason, feedback and pending-action state; an earlier callback
completion must not affect the replacement review. Terms include IDs, visible
content, requirements, recommendations/targets, counts and labels. Controlled
`checkedItemIds`, `selectedOptionId` and `selectedScopeIds` are excluded from
that replacement key. Cancel does not change the recommendation or mutate the
consumer's controlled selection.

## Consumer intents

All selected IDs identify current entries. Final list payloads contain all
currently selected IDs, including optional selections, without duplicate IDs.
Before submit includes every current field ID and no field values.

| Component | Intent | Data |
| --- | --- | --- |
| Checklist | `check-item` | `{reviewId,itemId,checked}` |
| Checklist | `approve-checklist` | `{reviewId,itemIds}`; all required items checked |
| Before submit | `confirm-submit` | `{reviewId,fieldIds}` |
| Destructive guard | `confirm-destructive` | `{reviewId,affectedCount}` |
| Human override | `select-override-option` | `{reviewId,optionId}` |
| Human override | `override` | `{reviewId,optionId,reason}` |
| Permission request | `select-scope` | `{reviewId,scopeId,selected}` |
| Permission request | `request-permission` | `{reviewId,scopeIds}` |
| Permission request | `deny-permission` | `{reviewId}` |
| First four components | `cancel` | `{reviewId}` |

## JSON Schema and proof limits

The existing public JSON Schema exporter describes parsed/output shapes,
including typed defaults, required fields, string/array bounds, finite JSON
primitive alternatives and integer bounds. Descriptions disclose unique-ID,
current-reference and required-item/scope rules. Those cross-field checks run
in Zod; the generated JSON Schema alone cannot express all of them. It also
cannot attest fresh consent, phrase entry, callback behavior or an actual grant.

The source work preserves runtime/server/host protocol and authorization
boundaries. Focused schema, React, preview, installed-consumer and browser
results must retain their own source and execution identities. No npm release,
external MCP host, hosted interaction, assistive-technology/device or full
catalogue acceptance follows from this five-component cohort.
