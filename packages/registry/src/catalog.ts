export type CatalogCategory = "primitive"|"approval"|"tool-execution"|"data-review"|"forms"|"decision"|"trust"|"host-state";
export type CatalogItem = { name:string; slug:string; category:CatalogCategory; description:string; specialized?:boolean; dependencies?:string[]; registryDependencies?:string[]; security:{modelVisible:string[];privateOnly:string[];callsTools:string[];destructive:boolean} };
const slug=(name:string)=>name.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();
const descriptions:Record<CatalogCategory,string>={primitive:"Accessible MCP App primitive",approval:"Human review and approval for agent actions", "tool-execution":"Transparent tool execution and recovery", "data-review":"Structured output and evidence review",forms:"Schema-driven human input",decision:"Explainable option comparison and selection",trust:"Trust, consent, evidence, and audit", "host-state":"Resilient host and application state"};
const names:Record<CatalogCategory,string[]>={
  primitive:["Button","Card","Badge","Tabs","Dialog","Input","Textarea","Select","Alert","Tooltip","Skeleton","EmptyState"],
  approval:["ApprovalCard","ApprovalChecklist","ConfirmationPanel","RiskReviewPanel","BeforeSubmitConfirmation","DestructiveActionGuard","HumanOverridePanel","PermissionRequestCard"],
  "tool-execution":["ToolProgressTimeline","ToolCallCard","ToolResultCard","RunningTaskCard","RetryableErrorState","PartialResultViewer","QueuedStepList","ToolTraceViewer"],
  "data-review":["EntityReviewTable","DiffViewer","RecordInspector","FieldConfidenceList","ExtractedFieldsReview","ConflictResolver","ValidationSummary","SourceEvidencePanel","DocumentPreview","FileReview"],
  forms:["SchemaForm","DynamicQuestionFlow","MissingDataRequest","MultiStepForm","InlineEditForm","FormProgressCard","ValidatedFieldList"],
  decision:["ComparisonMatrix","OptionSelector","RecommendationCard","TradeoffPanel","ScoreBreakdown","RankingList","DecisionMemo"],
  trust:["AuditTrail","ReasoningSummary","SourceList","EvidenceDrawer","DataAccessNotice","PrivacyBoundaryCard","ConsentPanel","ModelContextPreview"],
  "host-state":["AuthRequiredCard","BillingGate","UnsupportedHostNotice","NoDataState","LoadingBridgeState","OfflineState","PermissionDeniedState","ExpiredSessionState"]
};
const specialized=new Set(["ApprovalCard","ToolProgressTimeline","SchemaForm","EntityReviewTable","AuditTrail"]);
export const catalog:CatalogItem[]=Object.entries(names).flatMap(([category,items])=>items.map(name=>({name,slug:slug(name),category:category as CatalogCategory,description:`${descriptions[category as CatalogCategory]}: ${name}.`,specialized:specialized.has(name),dependencies:["@mcpcn/core","@mcpcn/schemas","react"],registryDependencies:category==="primitive"?[]:["button","card","badge"],security:{modelVisible:category==="host-state"?[]:["decision","userInput"],privateOnly:["internalId","rawPII"],callsTools:category==="approval"||category==="tool-execution"?["configuredTool"]:[],destructive:category==="approval"}})));

export const blockCatalog = [
  ["review-before-action","Review a planned external-state change before executing it.",["approval-card","diff-viewer","audit-trail"]],
  ["collect-missing-data","Ask only for fields an agent still needs.",["schema-form","missing-data-request"]],
  ["extract-review-save","Review extracted fields, evidence, and corrections before saving.",["extracted-fields-review","source-evidence-panel","approval-card"]],
  ["compare-options-approve","Compare options with evidence and approve the final choice.",["comparison-matrix","score-breakdown","approval-card"]],
  ["multi-step-tool-run","Track a recoverable multi-step tool workflow.",["tool-progress-timeline","retryable-error-state"]],
  ["approval-gated-tool-call","Require explicit consent before an app-only tool call.",["destructive-action-guard","tool-call-card"]],
  ["human-corrects-ai-output","Edit and validate structured agent output.",["inline-edit-form","validation-summary"]],
  ["agent-generated-report-review","Review sources, conclusions, and publication intent.",["reasoning-summary","source-list","confirmation-panel"]],
  ["file-upload-and-extract","Review a file and its extracted structured content.",["file-review","document-preview","extracted-fields-review"]],
  ["table-bulk-action-review","Show affected rows and impact before a bulk action.",["entity-review-table","risk-review-panel","approval-card"]],
  ["admin-change-review","Review settings diffs, affected users, rollback, and approval.",["diff-viewer","data-access-notice","approval-card","audit-trail"]]
].map(([name,description,components])=>({name:name as string,description:description as string,components:components as string[]}));

export const exampleCatalog=["hr-candidate-review","document-extraction","ecommerce-checkout-review","admin-settings-change","research-workflow"] as const;
export function findCatalogItem(name:string){const normalized=name.toLowerCase();return catalog.find(item=>item.slug===normalized||item.name.toLowerCase()===normalized)}
