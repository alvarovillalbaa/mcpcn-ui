# Docs and installed consumers — passed

**Passed: docs production build, seven local archives, both installed consumers
and two separate lifecycle controls.** The [whole actual result](consumer-checks.json)
retains every outcome, artifact identity, raw report and bounded phase log.
Independent decoding confirms the two exact consumer names and two exact
lifecycle identities; the earlier [52-case result](source-installation-52-checks.md)
remains separate and was not rerun.

[Run 41852504728](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/41852504728),
job `126652243639`, ran on 4 November 2026, 14:55:59–14:56:59 UTC. Preparation:
`eca3d6a031019cc142cfd3ab01f38c9365ce02c6`; activation:
`4896cad039562785508d420cf0205664962d587e`. Profile: Ubuntu 24.04, Linux x64,
Node `v24.21.0`, pnpm `10.24.0`, TypeScript `5.9.3`, Next.js `16.3.0`.
Runtime executable hashes are retained; fixture timings are not benchmarks.

| Installed consumer | Entries | Owned output files | Compiler | Outcome |
| --- | ---: | ---: | --- | --- |
| Source copy | 79 | 87 | Own installed TypeScript 5.9.3 | Passed / removed |
| Package mode | 79 | 80 | Own installed TypeScript 5.9.3 | Passed / removed |

Package mode executed the actual owned `.bin/mcpcn` launcher and verified all
24 declared JS/type/CSS/bin targets across the seven installed local archives.
Both packaged CSS assets matched their source bytes. The JSON retains all seven
`0.1.0` archive identities/hashes, installed version pins, ownership manifests,
source-tree hashes and generated npm lock hashes. Fresh transitive npm resolution
is not claimed to reproduce the workspace graph. Both no-emit typechecks exited
zero with empty stdout/stderr; `skipLibCheck: true` remains an explicit limit.

The separate lifecycle controls passed:

- `leader close keeps a surviving owned group through TERM and KILL`.
- `repeated signals remain handled during cleanup and report`.

The second control intentionally cancelled its owned process, which ended with
`SIGKILL`. It observed two authored signals during cleanup and one during
reporting. Its helper's
`interrupted: true` is expected fixture evidence. The normal consumer helper
and outer controller were not interrupted. Both helpers verified zero remaining
owned commands and original-group absence; fixtures finished empty and
ownership-checked scratch removal passed.

All 56 outer commands exited zero with observed exit/close and original groups
absent. All 22 normal-helper commands (14 archive checks and eight consumer
commands) also exited zero. Six full guards passed:
316 inputs / 12,326,975 bytes, all 327 tracked preparation identities, clean
index/working bytes and unchanged historical evidence. Seven package builds,
canonical generation of 79 byte-identical registry entries, the docs build and
seven local packing operations passed. The docs build generated 81 static pages;
that build count is not browser coverage. Controller `errors` was empty.

The retained lifecycle JSON is 3,347 bytes (948 gzip bytes), SHA-256
`931d9cd7c3224b07aa6b6804c541245da409b52e0bd17aca6507ec52a841a32a`.
Consumer JSON is 45,786 bytes (9,901 gzip bytes), SHA-256
`4116a13abe1f37e61f1fde591cafb0591e87ab8bee3d4393cb83861e28c24819`.
Each matches its helper stdout exactly and is stored only once. Independent
checks also verified all 38 outer raw phase streams and 21 nonempty internal
raw streams against their lengths/hashes. Pre-build registry-bin warnings,
Next's absent-build-cache notice and GitHub's Node-20-to-24 action warning remain
in the evidence.

Final publication will remove only this packet's temporary workflow and advance
`qa/mcpcn-consumers-20261104` to that final source as a retired bookmark. The two
old 52-check bookmarks remain at `50034ca`. Broad CI/release definitions stay
unchanged and were not executed. Six status documents change in this later
edition; the other 310 of the 316 checked inputs remain unchanged. Reproduce
the immutable preparation above; all historical seals and failures remain intact.

This result establishes local archive installation and the bounded build/type/
artifact scopes. It does not establish public npm availability, native browser
events/accessibility, CSS runtime rendering, live MCP hosts or hosted docs
delivery. The old protected staging READY result is separate; no new hosting
or page acceptance is claimed. Direct-child/original-group evidence does not
inventory all separate descendant sessions, dynamic libraries or eventual
runner disposal. No account, provider/model call, local install/build/test or
additional CI run was performed for this summary.
