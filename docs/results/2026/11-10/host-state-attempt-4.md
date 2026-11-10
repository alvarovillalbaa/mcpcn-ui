# Reported host states — checks and builds pass, consumer packaging fails

[Run42735306686](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42735306686),
job129562972917, checked
`7d643f94cd291a66cda5bafb596017ab0dafb4ea` with unchanged workflow
`cd8c75710a85073e41fd007cef2e366db9a22cf4`.

All96 focused cases passed:88new and8fixture regressions. All seven package
builds, playground type/build, the81-page docs build and both167-path registry
generations completed. [Unit originals](host-state-attempt-4-originals/units.json)
and [complete receipt](host-state-attempt-4-originals/receipt.json) preserve their
actual source boundary. These are repeated identities, not96additional unique
cases beyond the previous invocation.

The first fresh consumer failed during npm installation, before CLI, strict
compilation or rendering. Its [original nested streams](host-state-attempt-4-originals/consumers.json)
report `EUNSUPPORTEDPROTOCOL` for `workspace:*`; the second consumer and browser
stages did not run. The new harness used npm pack, which did not perform the
repository's established pnpm workspace conversion. The repair restores pnpm
pack, inspects every packed manifest for resolved protocols and unchanged public
exports/bins, and retains each original archive before consumer execution.
Application source, tests, manifests, dependencies and lock remain unchanged.

All51outer originals/552967manifest-declared bytes and complete outer streams
independently match their hashes. The [retention record](host-state-attempt-4-originals/retention.json)
binds the actual invocation and source. The four nested consumer streams also
match their observed lengths/hashes/EOF and descriptor closure; both direct
children/groups were reaped. Outer source guards, observed groups and scratch
cleanup pass. No machine-wide namespace or downloaded-ZIP digest proof is claimed.

The failed archive identities remain in the retained manifest. The first harness
copied archive bodies only after total success, so these failed archive binaries
were removed with scratch; they cannot be independently rehashed now. The
corrected retention order preserves future archives even when a consumer fails.
No generated files, archive release or new production source is accepted yet.
