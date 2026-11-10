# MCPCN reference workbench source

Five React review applications with real MCP tools and a private local SQLite
workspace. This focused source bundle supports the build/run path below. Use
the [full repository](https://github.com/alvarovillalbaa/mcpcn-ui) for library
development and its complete tests,history and acceptance records.

Requirements: Node24.22.2,pnpm10.24.0,macOS/Linux,and enough free space for the
locked development dependencies. From the extracted package directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm examples:build
pnpm examples:dev --workspace /absolute/private/reference-workspace
```

Choose an empty private workspace directory or a recognized workspace you own.
Open the printed loopback address and enter the per-launch access code. Do not
share the code or expose the listener through a tunnel. Ctrl-C closes the host,
MCP sessions and database. Relaunch with the same directory to see saved state
and audit. Back up that directory while closed; never commit it.

The [application guide](examples/README.md) explains the five workflows and
their exact boundaries. Candidate decisions,reviewed document text/fields,
uncharged orders,workspace preferences/rollback and reviewed research decisions
persist locally. There is no payment,SSO,email,OCR or AI provider connection.
The research adapter explicitly reads three configured pinned primary sources;
unavailable,oversized or invalid responses remain failures. No automatic retry.

Review tokens bind the authorized actor/workspace/record/revision/exact proposal.
Confirmations update state,audit and receipt in one SQLite transaction. Cancelling
a review revokes its token; replay cannot apply another change. A network error
does not prove failure: reload and inspect saved state/audit before trying again.
Private views/addresses/source text/tokens use app metadata; that channel is not
authentication or secure storage. Public/multi-user transports need their own
verified identity mapping. This workbench serves only trusted built-in apps.

SOURCE-MANIFEST.json binds every included source file to the checked Git commit.
No dependency directory,compiled binary,database,credential or repository
history is bundled. Existing public-library code is included as build source;
the private reference package is not an npm publication. Root scripts unrelated
to examples:build/examples:dev require the full repository. External-host,
production identity/providers,Windows and full accessibility/device acceptance
remain separate from authored local checks.
