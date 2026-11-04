# Tooling

`pnpm generate` materializes the canonical registry index/items, configuration
schema and seven package license copies. It preserves the existing examples and
framework templates. Generated registry files are committed so source installs
remain inspectable. Do not hand-edit them.

The [consumer scope](../docs/proposals/consumer-checks.md) owns the prepared docs
build, local packaging and disposable source/package installation checks.
Publication of a harness or inactive workflow does not establish a runtime pass.
