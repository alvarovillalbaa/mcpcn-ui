# Pinned docs hosting release

Last updated: 2026-11-04

The portfolio goal and standing owner authorization cover publishing the
personal MCPCN documentation site. The [consumer result](../results/2026/11-04/consumer-checks.md)
passed at `eca3d6a031019cc142cfd3ab01f38c9365ce02c6`; its final receipt and
temporary-workflow retirement are published at
`6d9cc119eb060279793733d3fb6491eea0569218`. Browser interaction, public npm
availability and live MCP hosts remain separate acceptance work.

This candidate additionally repairs the footer's nonexistent `/docs/security`
route by linking to the repository's existing `SECURITY.md`, and removes the
unverified “production-ready” metadata description. It changes two strings in
`apps/docs/app/layout.tsx`; package implementations, dependencies and the tested
consumer tooling remain unchanged. The hosted build must compile this exact
candidate; earlier CI does not establish a build of the later footer edition.

## Target and reviewed build configuration

- Existing Vercel project `mcpcn-ui`, ID `prj_cnLeaJNJjMZac7HpqsKw2jhIAQsW`.
- Existing team `team_JpdIsOJgYNpX0ywVZ54Zdb7m`.
- Verified production project domain `mcpcn-ui.vercel.app`; retain its existing
  Standard Protection policy. Production domains can be public under that policy;
  generated deployment URLs remain protected. No custom domain or bypass link.
- Public GitHub repository `alvarovillalbaa/mcpcn-ui`, ID `1367144718`.
  Pin the full immutable SHA containing this proposal and footer fix. Never use
  a floating main ref or substitute the historical staging deployment.
- Create one explicit `staging` deployment for review, with `withLatestCommit:
  false`; the full Git ref SHA is the actual source pin.
- Reviewed project settings: framework `nextjs`, root `apps/docs`, source outside
  that root enabled, Next default output directory, Node `24.x` and no build
  machine upgrade. The Node range is not exact CI-runtime reproduction.
  The private root manifest pins `engines.node` to `24.x`; public package
  manifests and dependency versions are unchanged.
- Install from the workspace using `cd ../.. && pnpm install --frozen-lockfile
  --ignore-scripts`. Build using `cd ../.. && node --version && pnpm --version
  && pnpm exec turbo run build --filter=@mcpcn/docs...`. Version output belongs
  in the provider log. The existing Turbo graph builds docs and its dependencies.

These are deliberate hosting build-setting overrides. Vercel documents that
project settings can persist to following deployments; record before/after
metadata rather than claim defaults stay unchanged. Do not change SSO, domains,
Auth, environment credentials, accounts, plans, GitHub CI or the npm release job.
Use the existing connected deployment API; do not retrieve or export secrets.

The [first candidate observation](../results/2026/11-04/hosting-attempt-1.json)
retains READY staging deployment `dpl_28vjvUrdV9p6YyCSfFJ5USHX8yYz` at source
`3da7a2b3ba94b9d75545d426edb167f8f3a13c5a`. It compiled 81 pages successfully
but actually used Node 26.13.0, so it was not promoted. The original private
root `>=20` range allowed Vercel's new Node 26 and overrode the requested 24.x
setting. Pinning that private build range to 24.x resolves the concrete profile
mismatch; capture the new deployment's actual minor/patch rather than assume
CI's exact 24.21.0. [Vercel announcement](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel),
[package engine precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions#version-overrides-in-packagejson).

## Release evidence

Retain selected project/source/settings metadata and the exact deployment
request, then poll that same deployment handle until terminal. Require the
intended project, exact Git source SHA, explicit target and successful Next build.
Retain build failures before repair. READY alone does not prove a rendered page.

After reviewing READY/build/source, use the existing project's `request_promote`
API to point production at that deployment. The API documents no rebuild;
it can reject an ineligible deployment. This is distinct from the dashboard's
preview-promotion rebuild workflow. Do not claim a fresh production-environment
build from this operation. Verify alias completion, exact deployment mapping
and unauthenticated canonical-domain responses before claiming public delivery.
HTTP/artifact checks do not substitute for native browser interaction.

Publish a bounded receipt under `docs/results/2026/11-04/`, preserving the old
hosting failures and protected staging observation. Source publication uses
`[skip ci]` so the existing broad CI and npm release job remain unexecuted.
No local installation/build, model call, new paid plan or database is included.

Primary contracts: [create deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment),
[point production traffic](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment),
[Standard Protection](https://vercel.com/docs/deployment-protection#standard-protection)
and the [public production-domain example](https://vercel.com/academy/optimize-your-vercel-account/deployment-protection#try-it).
