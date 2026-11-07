# V1 components: third CI invocation

7 November 2026 UTC. Result: **failed**. Units, the docs build and both
installed consumers passed; browser acceptance and owned cleanup did not.

- [Run 42423580771](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42423580771),
  job `128557000126`.
- Checked source `d488a6c03ec01dcda751c501343f5c2df8a51eb5`; workflow commit
  `879a51c67a2d47d11228aad0bb2b4d6d57350ca9`.
- The [first](v1-components-attempt-1.md) and
  [second](v1-components-attempt-2.md) failures remain immutable.

All 107 unit/installer identities passed. Next `16.3.0` completed the actual
docs build. Seven real pnpm archives and both fresh installed-consumer profiles
passed: all 79 entries, sixteen exports/data contracts, package-mode eighty
files and copy-mode 97 files/fourteen modules. Fourteen consumer commands and
strict TypeScript `5.9.3` with `skipLibCheck: false` ran successfully. These
local-archive consumers do not prove public npm availability.

The actual Playwright reporter records **21 passed, five failed**:

- B01/B02 found the real disabled `Working…` button while the assertion still
  searched for its idle `Approve & publish` label. The repair checks the actual
  pending label, absence of the idle label, disabled state and restoration.
  Consent, counter and rejection assertions remain intact.
- B03/B04 found the Cabin select, but its implicit label included its options.
  The product repair adds `aria-label={field.label}` to that native select;
  the exact Cabin locator remains unchanged.
- B10 observed 522-pixel layout against the required 390-pixel viewport before
  its journey. The product repair gives the stack grid a `minmax(0,1fr)` column,
  retaining the scrollable table. No viewport or overflow assertion is waived.

All 26 per-case contexts closed without pending request/observer jobs or
network errors. This does not turn the five failed journeys into passes.

Scanner reads remained unresolved for PID 3579, UID 1001, parent 3484,
group 3481, start 16431; and PID 3657, UID 1001, parent/group 3628, start 16668.
Both were zombies with stable `EACCES` environment reads. Recorded parent/group
identities were nonce-owned, but this run lacked fresh contemporaneous
parent/leader checks. The historical observations remain unresolved.

The next scanner requires fresh before/after child, immediate-parent and group
leader identities, stable PPID/group/UID and monotonic start times. Both parent
and leader must already be independently direct- or nonce-owned; derived child
attribution cannot seed provenance. It records complete proof tuples. Missing
proof falls back to the environment read; stable unknowns remain fatal. There
is no blanket zombie, group, UID or `EACCES` exemption.

Four canonical 461-file guards passed. The 44 outer commands retained their
terminal/stream observations: 42 finite zero exits, browser exit 1 and the
separately requested server SIGTERM/143. Final owned count was zero, but
uncertainty stayed true and the scratch root was **not removed**. Cleanup
correctly remains false; the later source repair does not change this result.

The [decode manifest](v1-components-attempt-3-originals/decode-manifest.json)
binds the original reporter, per-case JSON/screenshots, consumer, source and
process evidence. Generated output, seven binary archives and the full job log
remain outside Git. Generated bundle SHA256 is
`923a4f80324df7a82526b16e6b116f90e0242aa1ba5e396f4d954acf79c76d44`;
it is unaccepted by this failed packet. The full job log is 11,402,573 UTF-8
bytes, SHA256 `12cb3007784f4e14d859d7c77424d4cd1e3a613e9b503872ba1e3567be4c6fb0`.

The next candidate also makes the immutable `/r/registry.json` GET static.
Its generated index is 9,090,117 bytes; even its compact response is 8,903,209
bytes, above Vercel's documented 4.5 MB Function response limit. The route has
no request-specific input. This is prevention from source/provider evidence,
not an observed hosted failure. Actual build classification and full anonymous
HTTP parity still require verification. [Vercel limit](https://vercel.com/docs/functions/limitations),
[Next static GET contract](https://nextjs.org/docs/app/getting-started/route-handlers).

Evidence publication also exposed local Git `core.autocrlf=input` normalizing
one original Next build stream. The new attributes rule disables line-ending
conversion only inside original-evidence directories, preserving their exact
recorded bytes. It does not disable whitespace diagnostics or edit a stream.
