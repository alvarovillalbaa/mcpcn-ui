import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStructuredResult, registerComponentApp, registerComponentTool, type ToolContext } from "@mcpcn/server";
import { z } from "zod";
import { IdentitySchema, RevisionSchema, PublicRecordSchema, TokenSchema, privateRecordSchema, toolPrefix, METADATA_KEY, type Workflow, type RecordView, type Receipt } from "./contracts.js";
import { type Principal, WorkflowStore, type ProposedChange } from "./store.js";

export type WorkflowDefinition<S extends z.ZodType, P extends z.ZodType> = {
  workflow: Workflow; title: string; stateSchema: S; proposalSchema: P;
  propose(state: z.output<S>, proposal: z.output<P>, signal: AbortSignal): ProposedChange<z.output<S>> | Promise<ProposedChange<z.output<S>>>;
  validateCommit?(current: z.output<S>, proposed: z.output<S>): void;
};
export type ServerOptions = { store: WorkflowStore; principal: Principal; html: string };

/** Principal must come from verified transport/session context, never tool input. */
export function createWorkflowServer<S extends z.ZodType, P extends z.ZodType>(definition: WorkflowDefinition<S, P>, options: ServerOptions) {
  const { workflow } = definition, prefix = toolPrefix(workflow), schema = privateRecordSchema(definition.stateSchema);
  const principal = { ...options.principal, grants: [...options.principal.grants] }; Object.freeze(principal); Object.freeze(principal.grants);
  const server = new McpServer({ name: `mcpcn-${workflow}`, version: "0.1.0" });
  const requireActive = (context: ToolContext) => { options.store.authorize(principal, workflow); if (context.signal.aborted) throw new Error("reference_request_refused"); };
  const result = (view: RecordView<z.output<S>>, receipt: Receipt | null = null) => {
    const privateView = schema.parse(view), state = privateView.state as { status?: unknown };
    const visible = PublicRecordSchema.parse({ workflow, id: view.id, revision: view.revision, status: state.status, receipt });
    return createStructuredResult("reference-workflow", visible, { text: "The current review state is available in the app.", stateVersion: view.revision, meta: { [METADATA_KEY]: privateView } });
  };
  const common = { component: "reference-workflow" as const, resourceUri: `ui://mcpcn-reference/${workflow}.html`, outputSchema: PublicRecordSchema, visibility: ["app"] as Array<"app"> };
  registerComponentApp(server, { ...common, name: `${prefix}_read`, description: `Read the authorized ${definition.title} record and audit.`,
    inputSchema: z.object({ id: IdentitySchema }).strict(), readOnly: true, idempotent: true, html: options.html,
    visibility: ["model", "app"],
    handler: ({ id }, context) => { requireActive(context); return result(options.store.read(principal, workflow, id)); },
  });
  registerComponentTool(server, { ...common, name: `${prefix}_prepare`, description: `Prepare exact terms for ${definition.title}; no business change is applied.`,
    inputSchema: z.object({ id: IdentitySchema, revision: RevisionSchema, proposal: definition.proposalSchema }).strict(),
    handler: async ({ id, revision, proposal }, context) => {
      requireActive(context); const current = options.store.read<z.output<S>>(principal, workflow, id);
      if (current.revision !== revision) throw new Error("reference_request_refused");
      const state = definition.stateSchema.parse(current.state);
      const change = await definition.propose(state, proposal, context.signal); requireActive(context);
      const next = definition.stateSchema.parse(change.state);
      return result(options.store.prepare(principal, workflow, id, revision, () => ({ ...change, state: next })));
    },
  });
  registerComponentTool(server, { ...common, name: `${prefix}_confirm`, description: `Apply the exact authorized prepared ${definition.title} review once and append audit.`,
    inputSchema: z.object({ token: TokenSchema }).strict(), destructive: true, idempotent: true,
    handler: ({ token }, context) => { requireActive(context); const committed = options.store.commit<z.output<S>>(principal, workflow, token, (current, proposed) => {
      definition.stateSchema.parse(current); definition.stateSchema.parse(proposed); definition.validateCommit?.(current, proposed);
    }); return result(committed.view, committed.receipt); },
  });
  registerComponentTool(server, { ...common, name: `${prefix}_cancel`, description: `Revoke an unconsumed ${definition.title} review without changing its business record.`,
    inputSchema: z.object({ token: TokenSchema }).strict(), idempotent: true,
    handler: ({ token }, context) => { requireActive(context); return result(options.store.cancel(principal, workflow, token)); },
  });
  return server;
}
