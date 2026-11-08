# Shared MCP Apps playground

Implementation scope, 8 November 2026. The [third focused CI packet](../results/2026/11-08/playground-checks.md)
passed at `caa5f6fbc62c7dabb36e9ed80d1e8698ebd5f0cb`: 76 units, twelve real
iframe browser cases and two newly installed consumers. Earlier core, consumer,
hosting and failed playground receipts retain their own pins and limits.

`apps/playground` owns one Vite build with two documents: the fixture host and
the component app frame. The docs site embeds that host; the packaged CLI serves
the same manifest-bound files. Neither surface fetches a package manager,
starts a consumer project's scripts or connects a provider/model/MCP server.

The host uses the pinned official SDK's `AppBridge(null, …)` and a
`PostMessageTransport` bound to the actual frame window. Its listener starts
before child navigation. It waits for initialization before sending tool input
and results. Replaced sessions receive a new iframe window; explicit resets
request a bounded teardown acknowledgement before closing the transport.
Late callbacks cannot update the replacement session. See the
[official host examples](https://github.com/modelcontextprotocol/ext-apps/blob/v1.7.5/src/app-bridge.examples.ts).

The simulator runs only the trusted bundled renderer. Edited JSON is data,
never HTML or JavaScript. This single-origin development fixture is not the
SDK's separate-origin architecture for untrusted HTML. The latter remains a
distinct acceptance boundary.

Both trusted iframe ancestors permit native form events with `allow-forms`.
The app document retains `form-action 'none'` through its own CSP so controlled
React submit handlers can run without granting navigation to a form endpoint.
The missing sandbox permission was observed in the second failed browser run.
The third packet observed actual controlled CLI-preview form submissions after
the repair; it does not establish every form interaction on every surface.

The selector covers the existing 79 identities: sixteen specialized components,
forty explicitly labelled generic aliases, twelve primitives and eleven blocks.
Owned component schemas validate the first two groups. Primitives and blocks
use a curated local fixture contract, not invented public Zod schemas. The file
block retains its native File locally and emits only name/type/size intent;
it does not read, extract or upload its contents. Preview fixture URLs/hrefs
are refused. Real consumer applications retain their own link policies.

The host accepts either a component envelope or a text-content tool result
containing `structuredContent`. Editors have UTF-8 byte and JSON depth/node
bounds. Normal invocation validates before sending; the separately labelled
invalid-schema control sends an authored fault through the real bridge so the
app can show its validation state. Export downloads the reviewed input/result.
The copied registration snippet requires a consumer-owned server and app HTML.

Component callbacks remain intent. Explicit approve/confirm/submit intents can
invoke the authored fixture tool; other intent does not automatically call it.
No fixture tool changes external state. Host controls select success, tool-error
or request-error responses. Tool/context capabilities are actually negotiated;
changing them starts a fresh session. Theme and dimensions travel through host
context, and display-mode requests publish the mode actually returned by the
host, including denial.

`_meta` stays separate from `structuredContent`. Model context is shared only
with the dedicated button and contains only `component` and `decision`. The
visible trace retains at most eighty method/ID summaries in memory. The pinned
SDK itself logs complete messages with `console.debug`; no claim is made that
UI-only metadata is absent from developer-console output.

The CLI's `dev [--port=N]` and `preview <item> [--port=N]` bind only
`127.0.0.1`, defaulting to 4545. They serve verified bundled assets, never the
working directory. Startup acknowledges listening; an occupied port is refused
without touching its owner. Shutdown drains only owned connections and reports
SIGINT/SIGTERM as 130/143. The public CLI does not automatically open a browser.
Repository HMR remains `pnpm --filter @mcpcn/playground dev`.

Vite builds the artifact once. CLI/docs build-only workspace edges order its
creation; staging checks the exact file set, hashes and previous ownership
before replacement. No external dependency version changes are required. The
runtime's SSR tests declare the existing-catalog React DOM package as a test-only
development edge; its first missing-dependency failure has its own receipt.
Canonical copied runtime payloads were regenerated through their owner in the
isolated export. The passing deterministic 167-file profile and its subsequent
owner-controlled adoption remain distinct from the checked seed Git SHA.

Storage Guard reports 8.1 GiB free against 34.0 GiB required. No local install,
application import, build, browser or server was used locally for this work.
The accepted remote packet observed installed CLI launches, both frame documents,
edited fixtures, negotiated capabilities, errors, bounded privacy observations,
lifecycle and owned cleanup. Its seven-file artifact matched all four built/staged/
installed copies. The separate [public delivery observation](../results/2026/11-08/playground-public-delivery.md)
subsequently passed sixteen anonymous canonical-origin GETs at source
`6489c25dfa38b51076fab77eb8429ece3fc5239a`: the original seven routes and the
SSR wrapper/manifest/all seven artifact files. It establishes full body/hash and
HTTP closure observations, not hosted browser interaction or SDK negotiation.
Provider READY/source/alias metadata is recorded separately. Public npm,
external real hosts, devices, full accessibility and the remaining library/
example work remain separate.
