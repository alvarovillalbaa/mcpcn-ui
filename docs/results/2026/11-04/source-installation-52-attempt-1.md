# Source-installation checks — attempt 1

**Failed.** The [actual controller result](source-installation-52-attempt-1.json)
records 50 passing and two failing cases, with no pending/todo cases. Independent
decoding of its lossless Vitest JSON confirms all 52 unique full titles match
the prepared set; the required all-passing condition is false.

[Run 41844232780](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/41844232780),
job `126623434222`, ran on 4 November 2026, 14:06:18–14:06:50 UTC. It used
Node `v24.21.0`, pnpm `10.24.0`, Vitest `4.1.10`, Linux x64. The immutable
preparation was `639181752c453540ee35758f85d9a22e73907de5`; activation was
`ca752c6aa757ead525eb6661aacd61a73582289f`, on the owned branch-create route.

| Authored file | Passed | Failed |
| --- | ---: | ---: |
| Source registry | 12 | 0 |
| Installer | 16 | 0 |
| Workflow blocks | 10 | 2 |
| Configurator | 12 | 0 |
| **Total** | **50** | **2** |

Both failures report `Expected authored element was not rendered` through the
captured-button helper in `packages/react/src/blocks.test.tsx`:

- `MultiStepToolRun renders actual states and emits retries only for a known failed step`, at line 92.
- `busy and invalid controlled contexts cannot dispatch actions even through captured callbacks`, at line 174.

All seven package builds and the canonical generator exited zero. Generation
reported 79 source-registry items and remained byte-identical. All four source
guards passed: 313 inputs / 12,255,213 bytes, all 318 tracked identities, clean
index and working bytes, and unchanged historical results. The
[source seal](source-installation-52-source.json) remained
`198c0e3c1d6333034d710d831412baf9abe0fca298f951ad6ad1dfaf8d17e8ce`.

There were 35 recorded commands: the test process exited 1; the other 34 exited
0. Every command recorded exit, stream close and original process-group
absence, without interruption. The fixture-empty gate failed because one
entry, `node-compile-cache`, remained. Its creator is not established by that
name. Ownership-checked scratch removal passed; this does not convert the
fixture-empty failure into a pass. Controller errors remain
`vitest_acceptance_failed` and `fixture_cleanup_incomplete`.

The decoded raw Vitest JSON is 22,678 bytes, SHA-256
`b1b39218c174bc9eb135671c1f0ca5dc50e8788117584aad3ded7a94d9128336`.
The original raw JSON and phase logs remain losslessly compressed in the result.
Installation warned twice that the registry CLI bin did not yet exist before
its build. GitHub also warned that the three pinned actions target Node 20 and
were forced to run on Node 24. These warnings are retained separately from the
actual test and cleanup failures.

No case was skipped, renamed or accepted through a fallback. No local rerun was
performed for this summary. This packet does not establish native browser/MCP
host acceptance, docs-app build, package archives, installed consumers, npm
release, hosted deployment or full-product readiness. Process evidence covers
direct children and their original groups, without a global descendant/session
inventory; ephemeral runner disposal is not independently observed.
