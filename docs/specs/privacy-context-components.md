# Privacy, consent and planned context

10 November 2026. The [owning brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7)
names DataAccessNotice, PrivacyBoundaryCard, ConsentPanel and ModelContextPreview
for reviewing data use and proposed model context. Its fetched edition is dated
24 August 2026. This cohort follows clean `a0a47b874f9c45108c8350d20dfe071ed3b825e8`.
Standing owner “approve everything / Keep going / Do all the work” covers the work.

Replace the final four generic aliases with strict four-state typed components.
Preserve all 79 identities, 11 blocks and both installation modes. The resulting
catalogue has 56 specialized components, 12 primitives and no generic aliases;
36 copied owners yield 40/41 item files and 80/119 package/copy consumer files.

- DataAccessNotice shows reported requester/purpose/status, ordered resources,
  operations, field metadata and reported record counts. Zero differs from
  absent. It reads no records; “allowed” is a report, not a permission grant.
- PrivacyBoundaryCard displays complete supplied model-visible/private-UI values
  and metadata-only server boundaries. Server-only entries strictly reject a
  value, including an explicitly undefined value. All labels are consumer reports;
  enforcement and keeping server-only data out of client payloads belong upstream.
- ConsentPanel starts with no selected scopes and an unchecked acknowledgement,
  even when the supplied reported decision is granted. Approval needs one or more
  available current scopes, every required scope and explicit acknowledgement.
  An unavailable required scope blocks approval. A separately supplied decline
  action needs no acknowledgement and grants/revokes nothing. No action is invented.
- ModelContextPreview shows every complete planned section, metadata-only excluded
  items and a reported token estimate (zero differs from absent). Included and
  excluded IDs are disjoint. A handoff request needs explicit acknowledgement;
  no context update, model call, transfer or billing estimate is performed here.

Root, report, action and member identities/revisions are explicit. Guard DTO
descriptors before schema reads; reject accessors, symbols, cycles, foreign
prototypes, sparse arrays, nonfinite numbers and unknown fields. Bound enclosing
depth to14, nodes to40000 and complete parsed UTF-8 JSON to2MiB. Existing
InspectableJSONSchema bounds each value to depth8/1000nodes/65536 serialized
characters; nothing is truncated. JSON is in labeled focusable scroll regions.
Render text as escaped text. Nonready branches have no report or action.

Callbacks emit current component/report/action IDs/revisions only, plus selected
scope IDs/revisions or included section IDs/revisions as applicable. No labels,
values, purposes, reasons or counts are dispatched. Scope order follows the
supplied request; unknown/duplicate/unavailable selections fail. Consumer callback
completion leaves the reported decision/access status unchanged. Callback/data
replacement (including A/B/A), malformed/nonready data and unmount fence obsolete
settlements. Callback replacement and complete data replacement clear the draft;
selection changes clear acknowledgement. Every accepted dispatch clears selection
and acknowledgement, including failures. Pending/external busy/absent callback or
unavailable action blocks dispatch. Failure feedback stays generic.

No bridge, network, tool, persistence, auth-policy or server-helper change belongs
to this cohort. Catalog security metadata declares intent fields; it is not an
enforced serializer. Do not put private values in structuredContent merely because
this component displays them as private. The existing server helper does not
automatically redact it. Consumers must route private state through their host's
private channel and enforce authorization before any later operation.

Fix the observed component-page H1 wrapping locally: readable responsive type,
break opportunities only between CamelCase words, exact accessible heading text.
Check all four new headings and the observed RecommendationCard heading at desktop
and narrow widths; do not replay closed decision interactions.

Prepare and freeze a new focused public CI packet, preserve failures, adopt only
accepted generated output, then release/deploy exact accepted source. Historical
controllers/results remain immutable. No paid account, dependency or public npm
publication is introduced.
