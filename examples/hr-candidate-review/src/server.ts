import { createWorkflowServer, type ServerOptions } from "@mcpcn/reference-workflows/server";
import { CandidateStateSchema, CandidateProposalSchema } from "./contracts.js";

export function createServer(options: ServerOptions) {
  return createWorkflowServer({ workflow: "hr-candidate-review", title: "candidate review", stateSchema: CandidateStateSchema, proposalSchema: CandidateProposalSchema,
    propose(current, proposal) {
      const status = { approve: "recommended", reject: "rejected", "request-info": "needs-info" }[proposal.decision] as "recommended" | "rejected" | "needs-info";
      if (status === current.status || proposal.decision === "approve" && current.gaps.some(gap => gap.blocking)) throw new Error("reference_request_refused");
      return { state: { ...current, status, note: proposal.note }, action: proposal.decision, title: `Record candidate decision: ${status}`,
        description: "This changes the local reference review record. It does not contact a candidate or make an employment offer.", riskLevel: "high",
        changes: [{ label: "Review status", before: current.status, after: status }, { label: "Reviewer note", before: current.note, after: proposal.note }] };
    },
  }, options);
}
