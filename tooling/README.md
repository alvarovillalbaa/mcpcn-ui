# Tooling

`pnpm generate` materializes the canonical registry index/items, configuration
schema and seven package license copies. It preserves the existing examples and
framework templates. Generated registry files are committed so source installs
remain inspectable. Do not hand-edit them.

The [consumer scope](../docs/proposals/consumer-checks.md) owns the docs build,
local packaging and disposable source/package installation checks. Its
[actual result](../docs/results/2026/11-04/consumer-checks.md) passed at immutable
source `eca3d6a031019cc142cfd3ab01f38c9365ce02c6`: seven archives, two 79-item
consumers and two separate owned lifecycle controls. The guarded controller
recorded clean source/index/working bytes and verified nested process/fixture
cleanup. No local build/install was performed; inactive source alone remains
insufficient evidence for future revisions. npm release, browser and live-host
acceptance remain separate.

The separate [sixteen-component v1 packet](../docs/proposals/v1-components-checks.md)
owns the new domain components, fourteen-module copied-source profile and
focused installer regressions. Its controller, browser cases and fresh-consumer
helper are prepared source until an immutable CI run supplies actual results.
Keep its generated-output vector and source seed distinct from the historical
consumer receipt above.
