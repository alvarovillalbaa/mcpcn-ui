# Reported host states — 100 passes and two fixture errors

[Run42737517677](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42737517677),
job129570263799, checked
`734027f74487404fa13b5e4152d20e0b17812102` using unchanged workflow
`cd8c75710a85073e41fd007cef2e366db9a22cf4`.

The [actual unit output](host-state-attempt-6-originals/units.json) records
102cases:100passed,twofailed,zero skipped. All88component checks, eight fixture
regressions and four installation cases passed. Valid36-file UI/37-file block
installation, repeated-add ownership and duplicate/unowned-payload refusal
passed on the corrected37-file installer bound.

HS-CLI02's copied oversized fixture adds one entry to36files, so it is now
within the37-file ceiling and no longer tests size overflow. The correction
adds a second distinct entry, making38files while retaining the exact
registry-invalid and no-write assertions. HS-CLI03 correctly creates a37-file
lock with an unowned member but asserted36files. It now asserts37, keeping the
lock-invalid, zero-transport and preserved-file requirements. Neither repair
changes application code or disables a check. Current older block-shaped
regression fixtures also need their matching38-file metadata assertions.

All25originals/122262manifest-declared bytes and complete streams match the
independent [retention record](host-state-attempt-6-originals/retention.json).
Source guards, observed process groups and scratch cleanup pass. The controller
stopped at this unit checkpoint; no new consumer or browser pass is claimed.
All previous partial passes and failures retain their actual sources. No
generated output, release or production change is accepted yet.
