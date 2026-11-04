# Public docs and registry delivery

Observed: 4 November 2026, 21:17 UTC.

[MCPCN's public site](https://mcpcn-ui.vercel.app) returned **five anonymous
HTTP 200 responses** in [run 41914588811](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/41914588811),
job `126870778451`, 21:16:53–21:17:03 UTC. The
[machine receipt](public-delivery.json) retains the actual single result,
response sizes/hashes, source comparisons, provider mapping and build observations.

| Endpoint | Result |
| --- | --- |
| `/` | Complete HTML, expected description/security link and public-package-pending notice |
| `/docs` | Complete HTML, expected description/security link and package-pending notice |
| `/schema/config.json` | Complete JSON, semantic equality with the pinned source |
| `/r/button.json` | Complete JSON, semantic equality with the pinned source |
| `/r/registry.json` | Complete 3,878,081-byte JSON, all 79 entries equal to the pinned source |

The checks used no credentials, cookies, share link or protection bypass. All
five streams completed and released; all requests settled within the 15-second
request and 60-second global bounds. Node 24.21.0 ran the dependency-free check
in one three-minute public Ubuntu job. The report was below its 16 KiB limit.
Object-key order was normalized for JSON comparisons; array order was retained.

The comparison/application source is
`435af4b7c523bd8013d25e852c1be81dfe9893b3`, tree
`f89ce30ddd10e17a1c7e13e896c704a59c66697c`. Vercel deployment
`dpl_9k4YUnqReUAkm5wR5bahPSkpWK7q` independently reports that exact source,
the intended project, READY production target and canonical-domain assignment.
Its build ran under Node 24.22.2/pnpm 10.24.0, passed the Node-major guard and
six Turbo tasks, and generated 81 static pages. Five dependency tasks reused
Turbo cache; this is not a clean rebuild of every package or reproduction of
CI's exact Node patch. Pre-build registry-bin warnings are retained. Only 100
provider build events were returned; no complete-build-log claim is made.

The project API still projects `live:false`; that field is preserved in the
receipt alongside the actual anonymous responses. Existing Standard Protection
(`all_except_custom_domains`), domain and account policy were not weakened.
The earlier two Node-26 staging observations, corrected Node-24 staging build,
HTTP-422 promotion rejection and local DNS/web transport failures remain in
their original receipts. None is rewritten as a successful public request.

The temporary workflow ran from activation
`11235ad7c25316364c5c21094da4b36065eabf1c`, checking out the application source
above. This final evidence edition removes that workflow and advances only
`qa/mcpcn-public-http-20261104` to the final main commit as a retired bookmark.
The inactive example remains. Broad CI/release definitions and the three older
check bookmarks are unchanged. No new deployment is needed for this docs-only
receipt and workflow retirement; the hosted artifact remains pinned above.

These are HTTP/artifact checks, not browser JavaScript, interaction, focus,
touch, accessibility or live MCP-host acceptance. Public npm release remains
pending account/namespace identity and authentication; the newer registry-tool
and `whoami` transport failures establish neither availability nor absence.
The separate [52-case](source-installation-52-checks.md) and
[installed-consumer](consumer-checks.md) results retain their own immutable
sources and proof limits. The portfolio goal remains active and unfinished.
