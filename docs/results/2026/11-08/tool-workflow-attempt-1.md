# Tool workflows — first invocation remains failed

8 November 2026 UTC. **Failed**, preserved before source repair.
[Run 42490013313](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42490013313),
job128760145109, checked immutable source
`5759187c04c00e438880104b8088d25dfb04115d`, workflow
`4dd03b6f3fb543d352dd75f010dba50df79b0b4e`.

The [original Vitest report](tool-workflow-attempt-1-originals/output-vitest.json)
collected **91 cases: 90 passed, one failed, zero pending**. The failing schema
case is “reuses the old finite acyclic descriptor-safe JSON guard without
invoking getters”: getter count was1, expected0. React30, fixtures8, registry7
and docs6 passed; schemas39/40. These are observations of this failed source,
not accepted passes carried into a later source.

The outer [receipt](tool-workflow-attempt-1-originals/receipt.json) correctly
retains `status: failed`, `errors: ["unit_result_totals"]`. Its final summary
has zero accepted unit-set cases because validation stopped before assigning
unitResults; it does not mean zero tests executed. Consumers and browser cases
did not run. No later pass can relabel this invocation.

The newly added collective payloadBudget unconditionally serialized its input
inside a parent superRefine. The existing descriptor-safe JSON child refused
the getter value, but [pinned Zod4.4.3](https://github.com/colinhacks/zod/blob/v4.4.3/packages/zod/src/v4/core/schemas.ts)
retains that value while continuing refinements after a continuable issue.
Parent JSON.stringify then invoked the getter. This is a defect in the new
collective budget composition; the old JSON guard's logic was unchanged.

The changed source returns from payloadBudget when `context.issues.length > 0`
before serializing. Invalid data still fails parsing; valid parsed data retains
the identical262144-byte UTF-8 limit. The same existing case now also checks
getter refusal in partial-result values and trace details, retaining the final
zero-call assertion and all91 case IDs. This is a proposed source correction
until a separate complete invocation passes; no local tests were run.

All37 commands and74 original streams are retained. The unit command exited1;
the other36 passed. Streams closed completely. Four canonical source guards
covered1,384 files, and reported owned cleanup passed with removed root,
zero remaining processes and uncertaintyfalse. Required builds/playground
typecheck and deterministic generation completed before the unit failure;
docs production build, archive packing, fresh consumers and browsers were not
reached. Source/build/generation observations are not functional acceptance.

The original generated bundle is44,003,620 bytes, SHA256
`9eadcd5ba3a9585dd59918acedb114139d299beb3453f4d9958c2cc8e1b7a007`.
Its [exact gzip transport](tool-workflow-attempt-1-originals/generated-files.json.gz)
is8,486,495 bytes. `generation.tested` remainsfalse; these bytes were **not
adopted**. A later source must regenerate and pass its own complete profile.

The [decode manifest](tool-workflow-attempt-1-originals/decode-manifest.json)
verifies78 normal originals and one generated original, complete ordered
chunks, single-member gzip, byte/hash bindings and the unique failed result.
[Retention](tool-workflow-attempt-1-originals/retention.json) preserves all
normal originals and generated transport. The separately retained raw log is
12,476,003 bytes, SHA256
`f0a486d120ef5fde656a17f47c79f59c34d418efc76d572f093e028dd874b8e7`.
Accepted main runtime, registry, hosting and older releases remain unchanged.
