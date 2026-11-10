# Reported host states — 95 passes and one observer failure

[Run42734327858](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42734327858),
job129559726971, checked source
`a38fd0d905c1a3a20154c3c188fefa5a0e8310d2` with unchanged workflow
`cd8c75710a85073e41fd007cef2e366db9a22cf4`.

The [actual unit output](host-state-attempt-3-originals/units.json) records
96cases:95passed,onefailed,zero skipped. All88new host-state cases and seven
fixture regressions passed. The failure is the older fixture observer
`uses owned schemas for specialized and generic entries only`. Its object-only
fallback omits the existing ConflictResolver, ValidationSummary, OptionSelector
and RankingList four-state union schemas. The correction adds those four exact
names to the existing four-object-branch check. It changes no application,
validation predicate or new test assertion, and does not relax the check.

The six prerequisite package builds and both real registry generations completed.
Both167-file snapshots are retained in the [receipt](host-state-attempt-3-originals/receipt.json).
The harness stops at the failing unit checkpoint: no playground/CLI/docs build,
installed-consumer or browser pass is claimed. The earlier two failures retain
their own source identities and actual boundaries.

All25originals/119814manifest-declared bytes and complete streams independently
match their hashes. The [retention record](host-state-attempt-3-originals/retention.json)
binds source/workflow/run/job/artifact and terminal source/observed-group cleanup.
The scratch is removed. Machine-wide namespace scanning and downloaded-ZIP digest
comparison remain outside this proof. No generated files were adopted.

The corrected source will run the focused packet again before proceeding to its
remaining stages. Repeated cases retain their actual invocation identities;
they are not counted as additional unique coverage.
