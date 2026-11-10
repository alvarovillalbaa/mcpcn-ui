# Reported host states — second invocation failed

[Run42733467463](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42733467463),
job129556917748, checked candidate
`487a82d76ca485f6582a47df90d78345ad17280a` using unchanged workflow
`cd8c75710a85073e41fd007cef2e366db9a22cf4`.

Six package builds completed, including the repaired schema and React packages.
The [CLI build](host-state-attempt-2-originals/build-cli.stdout.txt) compiled its
TypeScript, then its existing staging command failed with
`mcpcn: playground_stage_io_error`. The new harness built CLI before the
playground assets it stages. This is a harness ordering defect; the application
and existing staging contract are unchanged. No unit, consumer or browser case
ran, and no such pass is claimed.

The repair builds the six prerequisites, generates/checks schemas, builds the
playground, then builds CLI before packing. It retains both actual generation
snapshot vectors for independent later validation. This strengthened observer
uses checks protocol v2; both original v1 packets and validators stay intact.
No test assertion, dependency, lock, UI behavior, host protocol or server changes.

All twenty [original files](host-state-attempt-2-originals/packet-manifest.json)
were independently hash-validated, including every complete command stream.
The [retention record](host-state-attempt-2-originals/retention.json) binds
13452declared original bytes, actual run/job/artifact and source/workflow.
The terminal source guard passed. Observed command groups are gone, active
children zero, streams complete and scratch removed. This does not claim a
machine-wide namespace scan or original downloaded-ZIP digest comparison.

The new immutable third source must retain both prior failures. No local
application execution, paid plan, account or model call was introduced.
