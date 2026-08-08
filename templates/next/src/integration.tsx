import { AgentAppProvider } from "@mcpcn/runtime";
import { ApprovalCard } from "@mcpcn/react";
export function MCPCNIntegration(){return <AgentAppProvider><ApprovalCard title="Review action" riskLevel="medium" actionLabel="Approve" changes={[]} /></AgentAppProvider>}
