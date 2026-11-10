# Candidate review

Last updated: 2026-11-10

Review supplied candidate evidence,reported scores,missing data and risks. Choose approve,reject or request information,write a note,review exact terms and confirm. The real server persists the decision and audit; it never contacts a candidate or makes an offer.

Run the [shared workbench](../README.md) from the repository root. Its private
workspace survives restarts. The [React app](src/app.tsx) and
[actual MCP server](src/server.ts) share the [typed contracts](src/contracts.ts)
(`CandidateStateSchema` and `CandidateProposalSchema`). Server execution requires a trusted principal;
model/app visibility and UI consent alone do not authorize a mutation.

New implementation and focused checks are being prepared. Do not substitute
older component/server passes for this application acceptance. External hosts,
production identity/providers and physical-device/accessibility proof remain
separate. No paid plan,new account or model call is required for the local path.
