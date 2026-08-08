import { ApprovalCard } from "@mcpcn/react";
type Fixture = Omit<Parameters<typeof ApprovalCard>[0], "onAction" | "className" | "busy">;
export const fixture: Fixture = { title: "Place this order?", description: "The card will be charged immediately.", riskLevel: "high", actionLabel: "Pay €249", changes: [{label:"Order",after:"3 items · €249"},{label:"Shipping",after:"Calle Mayor 12"}], requiresExplicitConsent:true };
export function App(){ return <ApprovalCard {...fixture} onAction={(action) => console.info("ecommerce-checkout-review", action)} /> }
