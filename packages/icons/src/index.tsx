import type { SVGProps } from "react";
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export function AgentIcon(props: SVGProps<SVGSVGElement>) { return <svg {...base} {...props}><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3"/></svg>; }
export function ApprovalIcon(props: SVGProps<SVGSVGElement>) { return <svg {...base} {...props}><path d="M20 6 9 17l-5-5"/></svg>; }
export function ToolIcon(props: SVGProps<SVGSVGElement>) { return <svg {...base} {...props}><path d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7.9 7.9a2 2 0 0 0 2.8 2.8l7.9-7.9a4 4 0 0 1 5-5l-3 3"/></svg>; }
export function EvidenceIcon(props: SVGProps<SVGSVGElement>) { return <svg {...base} {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11l2 2 4-4"/></svg>; }
