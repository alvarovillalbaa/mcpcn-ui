# V1 components: second CI invocation

7 November 2026 UTC. Result: **failed at the documentation typecheck**. The
107 focused unit/installer cases passed; the complete packet is unaccepted.

- [Run 42422880367](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42422880367),
  job `128554890485`.
- Checked source `d41db84b8da2ec6a9d943a39799a7294bdd66b30`; workflow commit
  `879a51c67a2d47d11228aad0bb2b4d6d57350ca9`.
- The exact owned source branch was verified before this manual dispatch.
  The [first invocation](v1-components-attempt-1.md) remains unchanged.

The frozen installation, seven package builds and two explicit canonical
generations completed. The 107 literal unit identities passed: seventeen CLI
installer regressions, 33 decision, twenty execution, eight foundation, twenty
review and nine registry cases. These six files are separate from the old
whole 52-case packet.

Next `16.3.0` compiled the documentation successfully in five seconds, then
reported `TS2307` at `components/v1-decision-demos.tsx`: it could not resolve
`@mcpcn/schemas`. Three implicit-any diagnostics followed from that missing
type import. The docs app had not declared this direct workspace dependency.
The [original stdout](v1-components-attempt-2-originals/docs-production-build.stdout.txt)
and [stderr](v1-components-attempt-2-originals/docs-production-build.stderr.txt)
retain the errors. No typecheck was disabled or weakened.

The next candidate adds only `@mcpcn/schemas: workspace:*` to the docs manifest
and its exact `../../packages/schemas` lockfile link. The inverse of these
changes reproduces the previous two files exactly. All external versions and
resolutions remain unchanged. The runtime result of this repair is unverified
until its own invocation.

No package archive, installed-consumer or browser stage ran. The generated
bundle is retained outside Git: 28,438,763 raw bytes, SHA256
`031b0ad310a1ed4d8961b7489671f6cad958f97bd426c514eea724112fe50fb7`,
5,993,228 gzip bytes. It is a separately generated artifact from this source,
not bytes present in that Git commit, and is not accepted for publication by
this failed invocation.

The [original receipt](v1-components-attempt-2-originals/receipt.json) and
[decode manifest](v1-components-attempt-2-originals/decode-manifest.json) preserve
the actual source/process gates and complete outputs. Normal evidence contains
71 files, 142 chunks, 1,056,409 raw and 170,960 gzip bytes. The generated bundle
adds 2,664 chunks; combined gzip is 6,164,188 bytes, within the separate 8 MiB
budgets and 16 MiB combined cap. Canonical base64, single-member gzip completion,
lengths and SHA256 were independently checked.

All four source guards retained identical 388-file vectors, each 13,876,665
bytes. Thirty-four commands ran; only the documentation build exited 1.
Their terminal/stream observations and owned cleanup remain in the receipt;
cleanup completed with the owned root removed and no unresolved ownership.
Successful unit/generation and cleanup subresults do not turn this invocation
into full acceptance.

The complete original job log is retained outside Git: 8,555,958 UTF-8 bytes,
SHA256 `710ef577475f89249f21fd58ff7b98b81455930b039be711c58a85ace7354a57`.
Neither its embedded generated bundle nor a duplicate full log is committed
alongside the bounded decoded normal originals.

The full staged whitespace check reports seven original stream files with
their actual final blank lines. Those bytes are preserved for hash/EOF parity;
they are not rewritten to silence the diagnostic. The source-only whitespace
check excludes the raw-original directories and passes.
