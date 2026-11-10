import { createWorkflowServer, type ServerOptions } from "@mcpcn/reference-workflows/server";
import { AdminStateSchema, AdminProposalSchema } from "./contracts.js";

export function createServer(options: ServerOptions) {
  return createWorkflowServer({ workflow: "admin-settings-change", title: "workspace settings", stateSchema: AdminStateSchema, proposalSchema: AdminProposalSchema,
    propose(current, proposal) {
      const next = proposal.action === "change" ? proposal.settings : current.previous;
      if (!next || next.weeklyDigest === current.settings.weeklyDigest && next.retentionDays === current.settings.retentionDays) throw new Error("reference_request_refused");
      return { state: { ...current, status: proposal.action === "change" ? "changed" as const : "rolled-back" as const, settings: next, previous: proposal.action === "change" ? current.settings : null },
        action: proposal.action, title: proposal.action === "change" ? "Apply reviewed workspace settings" : "Roll back the reviewed settings", riskLevel: "high",
        description: `This updates only the local reference settings record for ${current.members.length} listed example members. It does not configure SSO, send digests or erase files. A later rollback also requires a fresh revision and review.`,
        changes: [{ label: "Weekly digest preference", before: String(current.settings.weeklyDigest), after: String(next.weeklyDigest) }, { label: "Retention preference (days)", before: String(current.settings.retentionDays), after: String(next.retentionDays) }, { label: "Affected example members", before: String(current.members.length), after: String(current.members.length) }] };
    },
  }, options);
}
