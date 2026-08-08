import { ToolProgressTimeline } from "@mcpcn/react";
type Fixture = Omit<Parameters<typeof ToolProgressTimeline>[0], "onAction" | "className" | "busy">;
export const fixture: Fixture = { title: "Research the market", steps: [{id:"1",label:"Gather primary sources",status:"succeeded"},{id:"2",label:"Verify claims",status:"running"},{id:"3",label:"Draft memo",status:"queued"}] };
export function App(){ return <ToolProgressTimeline {...fixture} onAction={(action) => console.info("research-workflow", action)} /> }
