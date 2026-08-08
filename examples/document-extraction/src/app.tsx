import { EntityReviewTable } from "@mcpcn/react";
type Fixture = Omit<Parameters<typeof EntityReviewTable>[0], "onAction" | "className" | "busy">;
export const fixture: Fixture = { title: "Review extracted invoice", columns: [{key:"field",label:"Field"},{key:"value",label:"Value"}], rows: [{id:"1",values:{field:"Invoice total",value:"€4,820"},confidence:.96}], actionLabel:"Save corrections" };
export function App(){ return <EntityReviewTable {...fixture} onAction={(action) => console.info("document-extraction", action)} /> }
