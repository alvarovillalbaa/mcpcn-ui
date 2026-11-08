# Form workflows — first invocation failed during React compilation

8 November 2026. **Failed**, not unit or browser acceptance.
[Run42501485030](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42501485030),
job128794994814, source15047be9815e91e824d557ed92b4521844663b3d,
separate workflow7da0491b345af17faf34a9fa4fb7dd7b2a3056c6.

The [original React build output](form-workflow-attempt-1-originals/build-react.stdout.txt)
reports TS2322 at form-workflow-components.tsx50:71. Repeated optional record
lookup produced Entry|undefined where Record<string,Entry> was required under
the unchanged noUncheckedIndexedAccess setting. React build exited2. There
were no new unit, installed-consumer or browser executions and no generated
bundle/archive adoption. Generation scope metadata is not generated output.

Twenty other outer commands passed; all42 original streams completed with
EOF/descriptor closure. Both full1700-file canonical source guards passed.
Owned cleanup removed its root, with no remaining or uncertain process and no
vanished/reused/stable-unreadable identity. The
[complete failed receipt](form-workflow-attempt-1-originals/receipt.json) retains
the sole `build_react_failed` error. Earlier prerequisite schema/core/runtime
builds are observations of this failed source, not carried acceptance.

The [decode manifest](form-workflow-attempt-1-originals/decode-manifest.json)
binds44 exact normal originals and zero generated originals. The separately
retained raw log is460755 bytes, SHA256
`38e0a02b358557a2ecd43b01801f399a4b1e0d59d29bb266d571db0f35f43084`.
The source remains immutable on its own QA branch. No test assertions, compiler
settings, case identities, timeouts, source/process gates or budgets are waived.

A minimal changed-source repair captures the previous entry once and explicitly
checks undefined before reusing that same object or constructing the unchanged
fallback. Peer review found no runtime branch change, cast or nonnull waiver.
All110 authored case identities, controller/browser/consumer and other app bytes
stay unchanged. A separate sibling candidate and complete new focused invocation
are required; this first source and every failed original remain failed.

No local build, test suite, install, application, server or browser ran under
failed Storage Guard. No model/provider call, account change or paid plan.
