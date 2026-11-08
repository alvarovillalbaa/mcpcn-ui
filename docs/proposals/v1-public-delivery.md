# V1 anonymous public delivery — preparation

Prepared 7 November 2026 UTC / 8 November Europe/Madrid; no run is claimed.

This separate post-acceptance packet is prepared, not executed. Its
[helper](../../tooling/check-v1-public-delivery.mjs) and
[inactive workflow](../examples/v1-public-delivery.workflow.yml) follow the
[v1 implementation packet](v1-components-checks.md). Do not activate or
dispatch before source acceptance, publication of the verified generated
registry bytes and review of the actual READY deployment/canonical alias.
Root owns those actions and the temporary workflow's later retirement.

Use the existing public `alvarovillalbaa/mcpcn-ui` repository, Vercel project
and `https://mcpcn-ui.vercel.app` origin. Manual dispatch on main requires a
full immutable `source_sha` and actual `deployment_id`. The read-only public
Ubuntu job checks out that source, runs pinned Node 24.22.2 and caps the whole
job at three minutes. No dependencies, builds, children, browser, credentials,
cookies, authorization header, share link, account, paid service or protection
change is involved. Original HOME and provider settings remain untouched.

Seven sequential anonymous TLS GETs have no redirects, retries or external
follow-up requests:

| Path | Required observation |
| --- | --- |
| `/` | Actual homepage title; pending public-package notice; 68 catalog entries, 11 workflow blocks, five reference examples and two install modes. |
| `/components/confirmation-panel` | `ConfirmationPanel`, Domain component, schema/events sections, actual confirmation fixture and initial preview-theme control. |
| `/components/dynamic-question-flow` | `DynamicQuestionFlow`, Domain component, schema/events sections, actual question fixture and initial preview-theme control. |
| `/components/tool-call-card` | `ToolCallCard`, Domain component, schema/events sections, actual inspection fixture and initial preview-theme control. |
| `/schema/config.json` | Complete semantic equality with `registry/config.schema.json`. |
| `/r/comparison-matrix.json` | Complete semantic equality with `registry/items/comparison-matrix.json`, including its actual specialized data schema. |
| `/r/registry.json` | Complete semantic equality with `registry/registry.json`; 79 unique entries: 16 specialized, 40 generic aliases, 12 primitives and 11 blocks. |

The HTML markers come from the actual home, component route, preview wrapper
and three authored demo sources. Sixteen/forty are registry metadata counts;
the homepage does not claim to display them. Script/style contents are excluded
from HTML marker matching. These are HTTP/SSR observations, not browser DOM,
interaction, theme rendering or all-assets acceptance.

Require HTTP 200, expected content type, authorized TLS and a complete body,
response, request and socket closure. Each request, including its validation,
has an absolute 15-second limit; all work and closing observations share a
90-second deadline. An earliest-step clock refuses admission unless the full
90 seconds plus stdout/margin fit the three-minute job. HTML is capped at
1 MiB per response, JSON at 16 MiB and
combined received bytes at 24 MiB. Check any Content-Length against actual
bytes and reject encoded bodies. Object-key order is immaterial for JSON;
array order and every finite value must match. Source comparison files are
read-only and rechecked for identity/size/hash after the observations.

The helper emits one bounded original JSON report after
`MCPCN_V1_PUBLIC_DELIVERY_RESULT=` (maximum 32 KiB, stdout deadline two seconds).
Retain its exact bytes and job log in the owning result receipt, including
failed/unrun route rows, statuses, full-body hashes, lengths, source bindings,
finite errors and closure metadata. Full HTTP bodies are only held in memory;
do not copy the roughly 9 MiB registry body into evidence. Nonzero exit or an
incomplete terminal/closure remains a failed packet.

The source SHA names the checked comparison baseline. The deployment ID is a
supplied provider-metadata observation; HTTP alone cannot establish that
deployment's source or alias mapping. Preserve independent build/source/READY
evidence, prior failures and the old five-route
[public-delivery receipt](../results/2026/11-04/public-delivery.md). This packet
does not rerun its old identities, the v1 browser/consumer cases, public npm
installation, live-host integration, accessibility, model behavior or future
availability. Preparation and activation are separate; no current pass or
publication is claimed here.
