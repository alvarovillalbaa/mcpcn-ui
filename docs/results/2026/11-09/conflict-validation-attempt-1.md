# Conflict and validation — first invocation failed

Checked source `a667170c2d31c6b334f5eff0632f1c2ceb429b8f` (direct child of
36129be78ef310545930e0fa9e92ae2aa65b2f06) ran under workflow
`25b3a0a7a7bb87a4908069c1de5e0af5ea907c8a`/411662634 in
[run42556347728](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42556347728),
job128962816674, on9November2026. The actual whole packet failed with
`unit_result_totals`. Preserve this result and its owned QA ref unchanged.

The retained runner JSON reports100cases:98passed/twofailed. CV-F07 used the
existing issue ID`missing` as an allegedly unknown selection; the current schema
correctly accepted that supplied issue. CV-S23 put an own`__proto__` key in a
positive JSON fixture, although the unchanged shared guard deliberately refuses
that key. These are two authored fixture mistakes. Correcting them leaves the
existing application/schema/JSON guard and all100literal case identities intact;
the corrected source needs a new complete focused invocation.

Seven required package builds and the playground build/typecheck completed.
The12 separate unchanged ownership prerequisites passed. Generation ran twice
deterministically, returning167bodies, but `generation.tested` isfalse because
acceptance did not complete. Docs build, archive consumers and browser cases
were not reached. None of the returned output is adopted or released.

All four reached native source guards passed across4379files/518484956bytes,
vectorSHA256`52773dbf0186e584765dcb48b47e5cea40ec34fea65df81f59dbc31e839d244b`.
Owned cleanup passed: root removed, zero remaining processes, no uncertainty.
The [failed retention](conflict-validation-attempt-1-originals/retention.json)
binds83canonical files/21608396bytes, SHA256
`dc8c3ebd8d2d9668b2a595367a7b51d7674d1acf886d5eaa1e4158d0e0fb0526`.
Full decoded provider log23487441bytes/SHA256
`c5d3193be225b3ed4a9b3837143cf0822c57e1dd1c3596757b20cf3a328a9177`
is retained privately, with its canonical gzip original. Actual runner originals
retain the individual98passes; the controller accepted-unit count remains0.
No failed, partial or generated outcome is relabelled as complete acceptance.
