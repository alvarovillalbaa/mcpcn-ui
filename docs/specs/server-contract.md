# Validated MCP server integration

10 November 2026. This separate cohort follows clean8405fd3c. The
[owning brief](https://app.notion.com/p/3b6a1ee8bd0680539d4ecb4b8a8ab4c7), fetched
again in its24August2026 edition, explicitly requires server registration,
validateToolResult and working server examples. Standing owner approval covers
the necessary free implementation, checks, temporary CI and publication.

The current helper accepts an output schema but registers it against a different
MCPCN envelope, never validates handler output itself and reparses SDK-parsed
input. It also omits request context, uses a private fake-server signature,
serializes camelCase CSP fields into a snake_case compatibility key, and has no
accepted server archive. The simulator emits an unvalidated raw JSON schema.
These are implementation gaps, not external-account blockers.

Use the existing locked SDK1.30.0/ext-apps1.7.5/Zod4.4.3. Prefer the official
[pinned server helpers](https://github.com/modelcontextprotocol/ext-apps/blob/v1.7.5/src/server/index.ts).
The [MCP tools contract](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/server/tools.mdx)
requires structuredContent to match outputSchema. The SDK tarball was read as
data and matched its registry SHA512 integrity; its own input validator already
parses arguments before invoking the callback. Do not run that transform twice.

The integrity-verified ext-apps1.7.5 tarball also exposes extensionless relative
imports in its server/browser declaration graph. Keep this package's low-level
convenience declarations on the real SDK1 types while delegating runtime calls
to the official helpers. Verify both Bundler and NodeNext server consumers with
skipLibCheck=false; do not patch vendor declarations, hide diagnostics or claim
that the separate browser runtime package has NodeNext acceptance.

Provide a typed Zod-object input, required output data schema, actual SDK request
context and RegisteredTool/RegisteredResource handles. Advertise the complete
MCPCN payload schema (kind/version/data/stateVersion), not just the data schema.
validateToolResult must validate that exact component and version, complete
bounded JSON data/text/metadata, and return an owned parsed result or a generic
validation failure without leaking input, output or schema diagnostics.
Handler exceptions, invalid results and cancelled requests return generic error
results without structured/private data. SDK-owned argument validation remains
SDK-owned; caller schemas must use safe diagnostics and pure refinements.

Guard result descriptors before schema reads: refuse accessors, symbols, cycles,
foreign prototypes, sparse arrays, unsupported values and prototype keys. Bound
depth20/nodes150000/collections1000/strings2MiB/complete UTF-8 result4MiB. Preserve
zero/false/null and complete values. Builders return independent JSON snapshots;
they do not infer schema correctness, redact declared private fields or send data.
Optional metadata remains a deliberate separate channel. Private values must
stay out of structuredContent/content; `_meta` is not an authorization boundary.

Keep model/app/both visibility explicit and validated, with the existing both
default. Visibility and annotations are host hints, never authorization. Preserve
the real SDK context so consumers can enforce identity, permissions and request
cancellation. No provider, role grant, authentication configuration or external
state change is supplied by this library.

Resource registration uses the official MIME/default/metadata path, stable ui://
URIs, bounded static or async HTML providers and complete standard CSP metadata
in both list/read. Preserve camelCase standard fields; explicitly map only the
supported connect/resource/frame compatibility fields to snake_case. Leave
baseUriDomains in the standard channel. See [OpenAI's primary reference](https://developers.openai.com/plugins/reference).
Declarations do not grant host/network permissions. Preflight tool and resource
configuration before mutation; if tool registration fails after creating a new
resource, remove only that exact newly returned resource handle.

The simulator snippet must require a real supplied Zod output schema and use
z.object input; it is an authored registration example, not server authorization.
Add a complete server guide and correct the examples page's unsupported claim
that all five UI consumers already include server execution and audit services.
Actual five-workflow server/persistence integration remains required later.

Include the server MIT notice and eight exact archives in this cohort's release.
Constrain the existing SDK peer to>=1.29.0<2 because ext-apps1.x uses SDK1.x APIs;
do not upgrade a dependency version. Derive the lock metadata in free CI and
accept only that exact peer-specifier change with all resolved versions/integrities
unchanged. No native generated lock edit. Existing registry source/items and
36copied owners must remain byte-identical. Generate only the missing server
license and verified lock metadata; do not replay closed component packets.

Freeze focused authored unit/protocol/installed-server/snippet/docs checks and one
bounded public job before execution. Use real McpServer/Client/InMemoryTransport
for protocol evidence, not registration spies alone. No external host, network
listener, database, provider/model or production call is needed. StorageGuard
10.9/34GiB prohibits local app imports/builds/tests/install/browser/server work.
