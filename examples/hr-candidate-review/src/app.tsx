import { ApprovalCard } from "@mcpcn/react";
type Fixture = Omit<Parameters<typeof ApprovalCard>[0], "onAction" | "className" | "busy">;
export const fixture: Fixture = { title: "Recommend Maya Chen?", description: "Evidence-backed shortlist recommendation.", riskLevel: "medium", actionLabel: "Approve recommendation", changes: [{ label: "Candidate status", before: "Screening", after: "Recommended", confidence: .82 }] };
export function App(){ return <ApprovalCard {...fixture} onAction={(action) => console.info("hr-candidate-review", action)} /> }
