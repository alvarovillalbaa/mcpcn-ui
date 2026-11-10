import { z } from "zod";

export const CandidateStateSchema = z.object({ status: z.enum(["screening", "recommended", "rejected", "needs-info"]),
  candidate: z.object({ name: z.string().min(1).max(200), role: z.string().min(1).max(200), summary: z.string().min(1).max(4000) }).strict(),
  evidence: z.array(z.object({ id: z.string(), title: z.string().min(1).max(300), excerpt: z.string().min(1).max(4000) }).strict()).min(1).max(20),
  scores: z.array(z.object({ label: z.string().min(1).max(200), value: z.number().min(0).max(100), reason: z.string().min(1).max(2000) }).strict()).min(1).max(20),
  gaps: z.array(z.object({ label: z.string().min(1).max(300), blocking: z.boolean() }).strict()).max(20),
  risks: z.array(z.string().min(1).max(2000)).max(20), note: z.string().max(4000),
}).strict();
export const CandidateProposalSchema = z.object({ decision: z.enum(["approve", "reject", "request-info"]), note: z.string().trim().min(5).max(4000) }).strict();
export const candidateSeed: z.input<typeof CandidateStateSchema> = { status: "screening", candidate: { name: "Authored candidate", role: "Platform engineer", summary: "Reference review of supplied work-sample evidence. These scores are reported evidence, not an automated hiring decision." },
  evidence: [{ id: "sample-one", title: "Authored work sample", excerpt: "Explained a reversible rollout, observable failure handling and a review boundary before changing data." }],
  scores: [{ label: "Technical reasoning", value: 82, reason: "Reported work-sample rubric score." }, { label: "Operational judgment", value: 88, reason: "Reported reviewer rubric score." }],
  gaps: [{ label: "References have not been collected", blocking: false }], risks: ["A work sample alone cannot establish job performance."], note: "" };
