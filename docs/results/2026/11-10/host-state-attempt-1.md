# Reported host states — first invocation failed

[Run42732870022](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42732870022),
job129554962496, used immutable candidate
`327a0d3f79a22d9f68f94be7d2f4f5d3cc6a7e67` and workflow
`cd8c75710a85073e41fd007cef2e366db9a22cf4`. It failed in the schema build before
any unit, installed-consumer or browser check ran. No pass is inferred.

The actual [compiler output](host-state-attempt-1-originals/build-schemas.stdout.txt)
reports TS2345: the generic `T extends ZodType` adapter did not preserve the
input type required by Zod's pipe. The repair names the input and output
parameters explicitly; validation predicates, field contracts and all test
assertions remain unchanged. A terminal source guard is also added to the new
controller so a future failed build records the post-failure source boundary.
The first packet has only its two actual earlier guards; no later guard is
invented for it.

All ten [original files](host-state-attempt-1-originals/packet-manifest.json)
were retrieved through the documented GitHub CLI download. Every declared file
and complete command-stream length/hash matches. The [receipt](host-state-attempt-1-originals/receipt.json)
records zero active children, no remaining observed original groups, complete
streams and scratch removed. This is not a machine-wide namespace scan.

GitHub artifact13726090533 reports4270ZIP bytes and SHA256
`2562457ee81bd1fa13654d7bf2288f27fa56d2b473ee8ebacfd75d733f74bde3`.
The CLI retained extracted originals rather than ZIP bytes, so that server
digest is not relabeled as a downloaded-ZIP comparison. The first direct ZIP
request failed to connect and its empty output remains private evidence.

The second invocation will use a new immutable source. The first source and
failure remain preserved. Storage Guard still excludes local application
execution; only bounded data validation, source and syntax checks ran locally.
