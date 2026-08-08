import { ApprovalCard } from "@mcpcn/react";
type Fixture = Omit<Parameters<typeof ApprovalCard>[0], "onAction" | "className" | "busy">;
export const fixture: Fixture = { title: "Disable SSO enforcement?", description: "This affects 842 workspace members.", riskLevel: "critical", actionLabel: "Disable SSO", changes: [{label:"SSO enforcement",before:"Required",after:"Optional",affectedCount:842}], requiresExplicitConsent:true, rollback:"Re-enable in workspace security settings." };
export function App(){ return <ApprovalCard {...fixture} onAction={(action) => console.info("admin-settings-change", action)} /> }
