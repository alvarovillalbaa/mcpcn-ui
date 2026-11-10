import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BlockKindSchema, BlockIdentitySchema, BlockRevisionSchema, BlockStateSchema, BlockTokenSchema,
  PublicBlockRecordSchema, BlockTermsSchema, BlockFormProposalSchema, BlockApproveProposalSchema, BlockChooseProposalSchema,
  BlockRetryProposalSchema, BlockRunStepProposalSchema, BlockReportProposalSchema, BlockExtractProposalSchema,
  BlockAcceptFileProposalSchema, BlockBulkProposalSchema, BLOCK_METADATA_KEY, blockToolNames,
  type BlockKind, type BlockState, type BlockStateFor, type BlockField, type BlockValues, type BlockOperation,
  type BlockProposal, type BlockTerms, type BlockRecord, type BlockReceipt } from "@mcpcn/schemas/blocks";
import { createStructuredResult, registerComponentResource, registerComponentTool, type ResourceOptions, type ToolContext } from "./index.js";
import { BlockWorkflowStore, type BlockPrincipal, type BlockPlan } from "./block-store.js";
import { captureBlockExecutors, requireBlockOperations, executeBlockOperations, type BlockExecutors } from "./block-operations.js";

export { BlockWorkflowStore, BLOCK_DATABASE_APPLICATION_ID } from "./block-store.js";
export type { BlockPrincipal, BlockPlan } from "./block-store.js";
export type { BlockSqlExecutor, BlockExecutors } from "./block-operations.js";
export type BlockServerOptions = {
  store: BlockWorkflowStore;
  resolvePrincipal(context: ToolContext): BlockPrincipal | Promise<BlockPrincipal>;
  policyRevision: string;
  html: ResourceOptions["html"];
  csp?: ResourceOptions["csp"];
  executors?: BlockExecutors;
};
function need(value: unknown): asserts value { if (!value) throw new Error("mcpcn_block_request_refused"); }
type Change = BlockTerms["changes"][number];
const shown = (value: unknown) => value === undefined ? "Not supplied" : JSON.stringify(value);
const statusChange = (before: string, after: string): Change => ({ label: "Record status", before, after });
const operationChanges = (operation: BlockOperation): Change[] => [
  { label: "Registered operation", before: "Not executed", after: operation.name },
  { label: "Exact operation arguments", before: "Not executed", after: shown(operation.arguments) },
];
function terms(current: BlockState, action: string, title: string, changes: Change[], riskLevel: BlockTerms["riskLevel"] = "medium", description = current.description): BlockTerms {
  return { action, title, description, changes, riskLevel };
}
function action<A extends BlockProposal["action"]>(proposal: BlockProposal, expected: A): Extract<BlockProposal, { action: A }> {
  need(proposal.action === expected); return proposal as Extract<BlockProposal, { action: A }>;
}
function formValues(fields: BlockField[], supplied: BlockValues): BlockValues {
  need(Object.keys(supplied).every(name => fields.some(field => field.name === name)));
  return Object.fromEntries(fields.map(field => {
    const value = supplied[field.name] ?? (field.type === "boolean" ? false : "");
    if (field.type === "boolean") need(typeof value === "boolean" && (!field.required || value));
    else {
      need(typeof value === "string" && (!field.required || value.trim().length > 0));
      if (value !== "" && field.type === "number") need(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)));
      if (value !== "" && field.type === "email") need(z.email().safeParse(value).success);
      if (value !== "" && field.type === "select") need(field.options?.some(option => option.value === value && !option.disabled));
    }
    return [field.name, value];
  }));
}
const fieldChanges = (fields: BlockField[], before: BlockValues, after: BlockValues): Change[] => fields.map(field => ({
  label: field.label, before: shown(before[field.name] ?? field.original), after: shown(after[field.name]),
}));
function chosenRows(current: BlockStateFor<"table-bulk-action-review">, ids: string[]) {
  need(ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => current.rows.some(row => row.id === id && !row.disabled)));
  return current.rows.filter(row => ids.includes(row.id));
}
function selectedStep(current: BlockStateFor<"multi-step-tool-run">, proposal: BlockProposal) {
  need(proposal.action === "retry" || proposal.action === "run-step");
  const index = current.steps.findIndex(step => step.id === proposal.stepId), step = current.steps[index];
  need(index >= 0 && step && step.attempts < 10000 && (proposal.action === "retry" ? step.status === "failed" : step.status === "queued"));
  need(current.steps.slice(0, index).every(before => before.status === "succeeded" || before.status === "skipped"));
  need(!current.steps.some(item => item.status === "running")); return step;
}
function extractFields(kind: "invoice" | "contract" | "resume", text: string) {
  const labels = { invoice: ["Supplier", "Total", "Currency"], contract: ["Party", "Effective date", "Term"], resume: ["Name", "Email", "Experience"] }[kind];
  return labels.map(label => {
    const match = new RegExp("^(?:\\uFEFF)?" + label + ":[\\t ]*(.*)$", "mi").exec(text), value = (match?.[1] ?? "").replace(/\r$/, "");
    need(value.length <= 4000);
    return { id: label.toLowerCase().replaceAll(" ", "-"), label, original: value, value,
      source: match ? match[0].replace(/\r$/, "") : `No ${label}: line was found.`, confidence: match ? 1 : 0 };
  });
}
function proposalSchema(block: BlockKind): z.ZodType<BlockProposal> {
  switch (block) {
    case "review-before-action": case "approval-gated-tool-call": case "admin-change-review": return BlockApproveProposalSchema;
    case "collect-missing-data": case "extract-review-save": case "human-corrects-ai-output": return BlockFormProposalSchema;
    case "compare-options-approve": return BlockChooseProposalSchema;
    case "multi-step-tool-run": return z.discriminatedUnion("action", [BlockRetryProposalSchema, BlockRunStepProposalSchema]);
    case "agent-generated-report-review": return BlockReportProposalSchema;
    case "file-upload-and-extract": return z.discriminatedUnion("action", [BlockExtractProposalSchema, BlockAcceptFileProposalSchema]);
    case "table-bulk-action-review": return BlockBulkProposalSchema;
  }
}
function planBlock(current: BlockState, proposal: BlockProposal, available: (operations: BlockOperation[]) => void): BlockPlan {
  switch (current.block) {
    case "review-before-action": case "approval-gated-tool-call": case "admin-change-review": {
      action(proposal, "approve"); need(current.status === "ready" || current.status === "failed"); available([current.operation]);
      const changes = [...current.changes, ...operationChanges(current.operation)];
      if (current.block === "admin-change-review") changes.push({ label: "Affected records", before: "Not applied", after: String(current.affectedCount) },
        { label: "Rollback guidance", before: "Not applied", after: current.rollback });
      return { preview: current, terms: terms(current, "execute-reviewed", current.title, changes, current.riskLevel,
        current.description + " Executes a trusted transaction-local SQL operation; no external provider is called by this recipe.") };
    }
    case "collect-missing-data": {
      const input = action(proposal, "submit"); need(current.status === "needs-data" && current.fields.every(field => !Object.hasOwn(current.known, field.name)));
      const values = formValues(current.fields, input.values);
      return { preview: { ...current, values, status: "collected" }, terms: terms(current, "collect-fields", "Save the reviewed missing information",
        [...fieldChanges(current.fields, current.values, values), statusChange(current.status, "collected")]) };
    }
    case "extract-review-save": {
      const input = action(proposal, "submit"); need(current.status === "extracted"); const values = formValues(current.fields, input.values);
      return { preview: { ...current, values, status: "saved" }, terms: terms(current, "save-fields", "Save the reviewed extracted fields",
        [...fieldChanges(current.fields, current.values, values), statusChange(current.status, "saved")]) };
    }
    case "human-corrects-ai-output": {
      const input = action(proposal, "submit"); need(current.status === "needs-correction"); const values = formValues(current.fields, input.values);
      return { preview: { ...current, values, status: "corrected" }, terms: terms(current, "correct-fields", "Save the reviewed structured output",
        [...fieldChanges(current.fields, current.values, values), statusChange(current.status, "corrected")]) };
    }
    case "compare-options-approve": {
      const input = action(proposal, "choose"); need(current.status === "ready"); const option = current.options.find(item => item.id === input.optionId && !item.disabled); need(option);
      return { preview: { ...current, status: "selected", selectedId: option.id }, terms: terms(current, "select-option", "Record the reviewed option",
        [...option.changes, { label: "Selected option", before: shown(current.selectedId), after: option.label },
          { label: "Complete option value", before: "Not selected", after: shown(option.value) }]) };
    }
    case "multi-step-tool-run": {
      need(current.status === "partial"); const step = selectedStep(current, proposal); available([step.operation]);
      return { preview: current, terms: terms(current, proposal.action === "retry" ? "retry-step" : "run-step", `Review ${step.label}`,
        [{ label: "Step", before: `${step.status}; ${step.attempts} attempts`, after: "Execute this step once" }, ...operationChanges(step.operation)], "medium",
        "Only this step will run. Other results and queued steps remain unchanged; external services require consumer-owned idempotency.") };
    }
    case "agent-generated-report-review": {
      const input = action(proposal, "review-report"); need(current.status === "ready" && input.conclusion.trim().length > 0 && current.sources.length > 0);
      return { preview: { ...current, conclusion: input.conclusion, status: "approved" }, terms: terms(current, "approve-report", "Record approval of the reviewed report",
        [{ label: "Conclusion", before: current.conclusion, after: input.conclusion }, statusChange(current.status, "approved")], "medium",
        "The complete report and its sources stay in this record. No external publication or message is sent.") };
    }
    case "file-upload-and-extract": {
      need(current.status !== "accepted");
      if (proposal.action === "extract-file") {
        const bytes = new TextEncoder().encode(proposal.text), sha256 = createHash("sha256").update(bytes).digest("hex");
        const file = { name: proposal.fileName, kind: proposal.kind, text: proposal.text, bytes: bytes.length, sha256 };
        return { preview: { ...current, file, fields: extractFields(file.kind, file.text), status: "extracted" },
          terms: terms(current, "extract-text", "Save this exact text extraction", [
            { label: "File", before: current.file?.name ?? "Not supplied", after: file.name },
            { label: "Document kind", before: current.file?.kind ?? "Not supplied", after: file.kind },
            { label: "Exact UTF-8 content", before: current.file?.sha256 ?? "Not supplied", after: `${file.bytes} bytes; SHA256 ${file.sha256}` },
          ], "low", "Review the complete source text and literal source matches before saving. This is not PDF/OCR or an AI interpretation.") };
      }
      action(proposal, "accept-file"); need(current.status === "extracted" && current.file && current.fields.length > 0 && current.fields.every(field => field.value.trim().length > 0));
      const source = BlockExtractProposalSchema.parse({ action: "extract-file", fileName: current.file.name, kind: current.file.kind, text: current.file.text });
      const content = new TextEncoder().encode(source.text);
      need(content.length === current.file.bytes && createHash("sha256").update(content).digest("hex") === current.file.sha256
        && shown(extractFields(source.kind, source.text)) === shown(current.fields));
      return { preview: { ...current, status: "accepted" }, terms: terms(current, "accept-extraction", "Accept the exact stored extraction", [
        { label: "File identity", before: "Not accepted", after: `${current.file.name}; SHA256 ${current.file.sha256}` },
        ...current.fields.map(field => ({ label: field.label, before: "Not accepted", after: field.value })),
      ], "medium", "Accept only the displayed stored file and fields. No second file is read or substituted.") };
    }
    case "table-bulk-action-review": {
      const input = action(proposal, "apply-rows"), selected = chosenRows(current, input.rowIds); available(selected.map(row => row.operation));
      return { preview: { ...current, selectedIds: selected.map(row => row.id) }, terms: terms(current, "apply-selected-rows", "Apply this exact reviewed row selection",
        selected.flatMap(row => [...row.changes, { label: "Current row revision", before: String(row.revision), after: "Checked by the registered SQL operation" },
          ...operationChanges(row.operation)].map(change => ({ ...change, label: `${row.label}: ${change.label}` }))), current.riskLevel,
        "The selected SQL operations share one savepoint. A failed member rolls back every selected business change; unselected rows are untouched.") };
    }
  }
}

/** One block registration owns only its own resource and four tool registrations. */
export function registerBlockServer(server: Pick<McpServer, "registerTool" | "registerResource">, block: BlockKind, options: BlockServerOptions) {
  BlockKindSchema.parse(block); const policyRevision = BlockIdentitySchema.parse(options.policyRevision), store = options.store;
  need(store instanceof BlockWorkflowStore && typeof options.resolvePrincipal === "function");
  const resolvePrincipal = options.resolvePrincipal.bind(options);
  const executors = captureBlockExecutors(options.executors), tools = blockToolNames(block), resourceUri = `ui://mcpcn/blocks/${block}.html`;
  const lifetime = new AbortController(), requestSignal = (context: ToolContext) => AbortSignal.any([context.signal, lifetime.signal]);
  const available = (operations: BlockOperation[]) => requireBlockOperations(operations, executors);
  const principal = async (context: ToolContext, signal: AbortSignal) => { need(!signal.aborted); const selected = store.authorize(await resolvePrincipal(context), block); need(!signal.aborted); return selected; };
  const result = (view: BlockRecord, receipt: BlockReceipt | null = null) => createStructuredResult(block,
    PublicBlockRecordSchema.parse({ block, id: view.id, revision: view.revision, status: view.state.status, receipt }),
    { text: "The authorized block record and exact review state are available in the app.", stateVersion: view.revision, meta: { [BLOCK_METADATA_KEY]: view } });
  const common = { component: block, resourceUri, outputSchema: PublicBlockRecordSchema, visibility: ["app"] as Array<"app"> };
  const owned: Array<{ remove(): void }> = [];
  try {
    owned.push(registerComponentResource(server, { component: block, resourceUri, html: options.html, ...(options.csp === undefined ? {} : { csp: options.csp }) }));
    owned.push(registerComponentTool(server, { ...common, name: tools.read, description: `Read an authorized ${block} record.`, readOnly: true, idempotent: true,
      visibility: ["model", "app"], inputSchema: z.object({ id: BlockIdentitySchema }).strict(),
      handler: async ({ id }, context) => { const signal = requestSignal(context); return result(store.read(await principal(context, signal), block, id)); },
    }));
    owned.push(registerComponentTool(server, { ...common, name: tools.prepare, description: `Prepare exact ${block} review terms without applying a business change.`,
      inputSchema: z.object({ id: BlockIdentitySchema, revision: BlockRevisionSchema, proposal: proposalSchema(block) }).strict(),
      handler: async (input, context) => {
        const signal = requestSignal(context), selected = await principal(context, signal);
        // SDK already parsed this concrete schema; do not re-run input transforms.
        const { id, revision, proposal } = input as { id: string; revision: number; proposal: BlockProposal };
        return result(store.prepare(selected, block, id, revision, policyRevision, proposal, signal, current => planBlock(current, proposal, available)));
      },
    }));
    owned.push(registerComponentTool(server, { ...common, name: tools.confirm, description: `Confirm one exact current authorized ${block} review and append audit.`, destructive: true, idempotent: true,
      inputSchema: z.object({ token: BlockTokenSchema }).strict(),
      handler: async ({ token }, context) => {
        const signal = requestSignal(context), selected = await principal(context, signal), committed = store.confirm(selected, block, token, policyRevision, signal, (current, proposal, database, prepared) => {
          const plan = planBlock(current, proposal, available);
          need(shown(BlockTermsSchema.parse(plan.terms)) === shown(prepared.terms) && shown(BlockStateSchema.parse(plan.preview)) === shown(prepared.preview));
          if (current.block === "review-before-action" || current.block === "approval-gated-tool-call" || current.block === "admin-change-review") {
            const batch = executeBlockOperations(database, selected, block, signal, [current.operation], executors);
            return { ...current, status: batch.status === "succeeded" ? "completed" : "failed", execution: batch.status === "succeeded"
              ? { status: "succeeded", result: batch.results[0] ?? null, message: "The reviewed transaction-local operation completed." }
              : { status: "failed", result: null, message: batch.message } };
          }
          if (current.block === "multi-step-tool-run") {
            const step = selectedStep(current, proposal), batch = executeBlockOperations(database, selected, block, signal, [step.operation], executors);
            const steps = current.steps.map(item => item.id !== step.id ? item : { ...item, attempts: item.attempts + 1,
              status: batch.status === "succeeded" ? "succeeded" as const : "failed" as const,
              result: batch.status === "succeeded" ? batch.results[0] ?? null : null, error: batch.status === "failed" ? batch.message : null });
            return { ...current, steps, status: steps.every(item => item.status === "succeeded" || item.status === "skipped") ? "completed" : "partial" };
          }
          if (current.block === "table-bulk-action-review") {
            const input = action(proposal, "apply-rows"), selectedRows = chosenRows(current, input.rowIds);
            const batch = executeBlockOperations(database, selected, block, signal, selectedRows.map(row => row.operation), executors);
            return { ...current, selectedIds: selectedRows.map(row => row.id), status: batch.status === "succeeded" ? "applied" : "failed",
              rows: current.rows.map(row => {
                const index = selectedRows.findIndex(item => item.id === row.id); if (index < 0) return row;
                return { ...row, revision: batch.status === "succeeded" ? BlockRevisionSchema.parse(row.revision + 1) : row.revision,
                  disabled: batch.status === "succeeded", execution: batch.status === "succeeded"
                    ? { status: "succeeded" as const, result: batch.results[index] ?? null, message: "The reviewed row operation completed." }
                    : { status: "failed" as const, result: null, message: batch.message } };
              }) };
          }
          return BlockStateSchema.parse(plan.preview);
        }); return result(committed.view, committed.receipt);
      },
    }));
    owned.push(registerComponentTool(server, { ...common, name: tools.cancel, description: `Revoke an unconsumed ${block} review without undoing a committed action.`, idempotent: true,
      inputSchema: z.object({ token: BlockTokenSchema }).strict(), handler: async ({ token }, context) => { const signal = requestSignal(context); return result(store.cancel(await principal(context, signal), block, token)); },
    }));
  } catch (error) { lifetime.abort(); for (const handle of owned.reverse()) handle.remove(); throw error; }
  return { block, tools, resourceUri, dispose() { lifetime.abort(); for (const handle of owned.splice(0).reverse()) handle.remove(); } };
}

export const registerReviewBeforeActionServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "review-before-action", options);
export const registerCollectMissingDataServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "collect-missing-data", options);
export const registerExtractReviewSaveServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "extract-review-save", options);
export const registerCompareOptionsApproveServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "compare-options-approve", options);
export const registerMultiStepToolRunServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "multi-step-tool-run", options);
export const registerApprovalGatedToolCallServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "approval-gated-tool-call", options);
export const registerHumanCorrectsAiOutputServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "human-corrects-ai-output", options);
export const registerAgentGeneratedReportReviewServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "agent-generated-report-review", options);
export const registerFileUploadAndExtractServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "file-upload-and-extract", options);
export const registerTableBulkActionReviewServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "table-bulk-action-review", options);
export const registerAdminChangeReviewServer = (server: Parameters<typeof registerBlockServer>[0], options: BlockServerOptions) => registerBlockServer(server, "admin-change-review", options);
