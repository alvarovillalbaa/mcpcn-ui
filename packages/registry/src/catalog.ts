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
const specialized=new Set(["ApprovalCard","ApprovalChecklist","BeforeSubmitConfirmation","DestructiveActionGuard","HumanOverridePanel","PermissionRequestCard","ConfirmationPanel","RiskReviewPanel","ToolProgressTimeline","ToolCallCard","ToolResultCard","RunningTaskCard","RetryableErrorState","PartialResultViewer","QueuedStepList","ToolTraceViewer","SchemaForm","DynamicQuestionFlow","MissingDataRequest","MultiStepForm","InlineEditForm","FormProgressCard","ValidatedFieldList","EntityReviewTable","ExtractedFieldsReview","DiffViewer","ComparisonMatrix","ScoreBreakdown","AuditTrail","SourceEvidencePanel","AuthRequiredCard","DocumentPreview","FileReview","SourceList","EvidenceDrawer","RecordInspector","FieldConfidenceList"]);
const componentDescriptions:Record<string,string> = {
  RecordInspector: "Select a current supplied record field and inspect its complete typed value and evidence.",
  FieldConfidenceList: "Inspect complete supplied field values and evidence with reported confidence, including zero and absence.",
  ApprovalChecklist: "Review required checklist items before emitting an explicit approval intent.",
  BeforeSubmitConfirmation: "Review current field values and explicitly consent before submission intent.",
  DestructiveActionGuard: "Review exact impact, type the confirmation phrase and explicitly consent to destructive intent.",
  HumanOverridePanel: "Select an alternative and explain an explicitly consented human override.",
  PermissionRequestCard: "Review requested scopes and explicitly request or deny consumer-owned permission intent.",
  ConfirmationPanel: "Review current change terms and explicitly confirm or cancel.",
  RiskReviewPanel: "Acknowledge identified risks and confirm the current mitigation terms.",
  ToolCallCard: "Inspect exact tool arguments, outputs and execution status.",
  ToolResultCard: "Inspect an explicit tool outcome and its complete structured result without executing a tool.",
  RunningTaskCard: "Review consumer-reported task progress and explicitly request inspection or cancellation.",
  PartialResultViewer: "Select reported result parts, inspect complete structured values and request an eligible part retry.",
  QueuedStepList: "Review ordered step states and attempts, select a step and request an eligible retry.",
  ToolTraceViewer: "Filter an ordered trace and inspect complete selected event details without starting a trace runtime.",
  RetryableErrorState: "Request a retry of retained tool arguments when the consumer permits it.",
  DynamicQuestionFlow: "Complete conditional questions and submit only currently visible answers.",
  MissingDataRequest: "Collect only missing typed fields while keeping known context read-only and outside submission.",
  MultiStepForm: "Edit typed fields across controlled steps, preserve drafts and validate before progressing or submitting.",
  InlineEditForm: "Review and edit typed values, then explicitly request only changed values or removals.",
  FormProgressCard: "Inspect consumer-reported form status and step progress without inferring completion.",
  ValidatedFieldList: "Review reported field validation, inspect complete values and request eligible field validation.",
  ExtractedFieldsReview: "Correct extracted fields against originals and evidence before submission.",
  DocumentPreview: "Inspect complete supplied text, JSON or ordered raster/text pages without reading or uploading a file.",
  FileReview: "Review a current file representation and extracted corrections before explicit scoped save intent.",
  DiffViewer: "Inspect before/after values and select an individual change for review.",
  ComparisonMatrix: "Compare criteria, select an available option and explicitly confirm it.",
  ScoreBreakdown: "Inspect finite weighted totals and individual criterion evidence.",
  SourceEvidencePanel: "Review supporting claims and excerpts, then select an evidence source.",
  SourceList: "Select a supplied source and request inspection using current source identity only.",
  EvidenceDrawer: "Inspect complete supplied text or JSON in a dismissible native modal without fetching or verifying it.",
  AuthRequiredCard: "Request scoped access through a consumer-owned intent callback."
};
const toolWorkflowSecurity:Record<string,CatalogItem["security"]> = {
  ToolResultCard: { modelVisible: ["id", "tool", "status"], privateOnly: ["title", "description", "result", "errorMessage"], callsTools: [], destructive: false },
  RunningTaskCard: { modelVisible: ["id", "status", "progress", "elapsedMs"], privateOnly: ["title", "description", "currentStep", "errorMessage"], callsTools: [], destructive: false },
  PartialResultViewer: { modelVisible: ["id", "status", "parts.id", "parts.status", "parts.attempt", "selectedPartId"], privateOnly: ["title", "description", "parts.label", "parts.value", "parts.message"], callsTools: [], destructive: false },
  QueuedStepList: { modelVisible: ["id", "steps.id", "steps.status", "steps.attempt", "selectedStepId"], privateOnly: ["title", "description", "steps.label", "steps.message"], callsTools: [], destructive: false },
  ToolTraceViewer: { modelVisible: ["id", "events.id", "events.kind", "events.parentId", "events.elapsedMs", "filterKind", "selectedEventId"], privateOnly: ["title", "description", "events.label", "events.details"], callsTools: [], destructive: false },
};
const formWorkflowSecurity:Record<string,CatalogItem["security"]> = {
  MissingDataRequest: { modelVisible: ["id", "fields.id", "knownFields.id"], privateOnly: ["title", "description", "fields.label", "fields.description", "fields.options", "knownFields.label", "knownFields.value", "drafts", "values"], callsTools: [], destructive: false },
  MultiStepForm: { modelVisible: ["id", "steps.id", "steps.fields.id", "currentStepId"], privateOnly: ["title", "description", "steps.title", "steps.description", "steps.fields.label", "steps.fields.description", "steps.fields.value", "steps.fields.options", "drafts", "values"], callsTools: [], destructive: false },
  InlineEditForm: { modelVisible: ["id", "fields.id"], privateOnly: ["title", "description", "fields.label", "fields.description", "fields.value", "fields.options", "drafts", "changes.value"], callsTools: [], destructive: false },
  FormProgressCard: { modelVisible: ["id", "status", "progress", "steps.id", "steps.status", "steps.progress", "selectedStepId"], privateOnly: ["title", "description", "steps.label"], callsTools: [], destructive: false },
  ValidatedFieldList: { modelVisible: ["id", "fields.id", "fields.status", "fields.validatable", "selectedFieldId"], privateOnly: ["title", "description", "fields.label", "fields.value", "fields.message"], callsTools: [], destructive: false },
};
const fileReviewSecurity:Record<string,CatalogItem["security"]> = {
  DocumentPreview: { modelVisible: ["id", "file.id", "file.revision", "state", "selectedPageId", "selectedSourceId"], privateOnly: ["title", "description", "file.name", "file.mimeType", "content.text", "content.value", "content.pages", "sources", "message"], callsTools: [], destructive: false },
  FileReview: { modelVisible: ["id", "file.id", "file.revision", "extraction.id", "extraction.revision", "extraction.fileId", "extraction.fileRevision"], privateOnly: ["title", "description", "file.name", "file.mimeType", "preview", "extraction.fields", "extraction.fields.original", "extraction.fields.value", "extraction.fields.evidence", "drafts", "values"], callsTools: [], destructive: false },
};
const sourceEvidenceSecurity:Record<string,CatalogItem["security"]> = {
  SourceList: { modelVisible: ["id", "revision", "state", "sources.id", "sources.revision", "selectedSourceId"], privateOnly: ["title", "description", "sources.label", "sources.url", "sources.excerpt", "sources.supports", "message", "localSelection"], callsTools: [], destructive: false },
  EvidenceDrawer: { modelVisible: ["id", "revision", "state", "source.id", "source.revision"], privateOnly: ["title", "description", "source.label", "source.url", "source.excerpt", "source.supports", "content", "content.text", "content.value", "message", "open", "localPresentation"], callsTools: [], destructive: false },
};
const recordInspectionSecurity:Record<string,CatalogItem["security"]> = {
  RecordInspector: { modelVisible: ["id", "revision", "state", "record.id", "record.revision", "record.fields.id", "record.fields.revision", "selectedFieldId"], privateOnly: ["title", "description", "record.label", "record.fields.label", "record.fields.value", "record.fields.confidence", "record.fields.evidence", "message", "localSelection"], callsTools: [], destructive: false },
  FieldConfidenceList: { modelVisible: ["id", "revision", "state", "fields.id", "fields.revision", "selectedFieldId"], privateOnly: ["title", "description", "fields.label", "fields.value", "fields.confidence", "fields.evidence", "message", "localSelection"], callsTools: [], destructive: false },
};
export const catalog:CatalogItem[]=Object.entries(names).flatMap(([category,items])=>items.map(name=>({name,slug:slug(name),category:category as CatalogCategory,description:componentDescriptions[name]??`${descriptions[category as CatalogCategory]}: ${name}.`,specialized:specialized.has(name),dependencies:["@mcpcn/core","@mcpcn/schemas","react"],registryDependencies:category==="primitive"?[]:["button","card","badge"],security:recordInspectionSecurity[name]??sourceEvidenceSecurity[name]??fileReviewSecurity[name]??formWorkflowSecurity[name]??toolWorkflowSecurity[name]??{modelVisible:category==="host-state"?[]:["decision","userInput"],privateOnly:["internalId","rawPII"],callsTools:category==="approval"||category==="tool-execution"?["configuredTool"]:[],destructive:category==="approval"}})));

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
