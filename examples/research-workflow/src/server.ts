import { createWorkflowServer, type ServerOptions } from "@mcpcn/reference-workflows/server";
import { ResearchStateSchema, ResearchProposalSchema, researchSources } from "./contracts.js";

export type SourceReader = (url: string, signal: AbortSignal) => Promise<string>;
/** Explicit fixed primary-source reads, no redirects, provider/model or arbitrary URL. */
export const readPrimarySource: SourceReader = async (url, signal) => {
  if (!researchSources.some(source => source.url === url)) throw new Error("reference_source_refused");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), headers: { Accept: "text/plain" } });
  if (!response.ok || !response.body || !/^text\/(plain|markdown)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new Error("reference_source_unavailable"); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65536) throw new Error("reference_source_too_large"); chunks.push(value); }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body); if (!text.trim()) throw new Error("reference_source_empty"); return text;
};
export function createServer(options: ServerOptions, read: SourceReader = readPrimarySource) {
  return createWorkflowServer({ workflow: "research-workflow", title: "research workflow", stateSchema: ResearchStateSchema, proposalSchema: ResearchProposalSchema,
    async propose(current, proposal, signal) {
      if (current.status === "completed") throw new Error("reference_request_refused");
      if (proposal.action === "decide") {
        if (!current.sources.some(source => source.status === "succeeded")) throw new Error("reference_request_refused");
        return { state: { ...current, status: "completed" as const, conclusion: proposal.conclusion }, action: "save-decision", title: "Save the reviewed research decision",
          description: "Persist the supplied human conclusion with the exact current sources and their failure states. The example does not generate a model answer.", riskLevel: "medium",
          changes: [{ label: "Decision", before: current.conclusion, after: proposal.conclusion }, { label: "Successful / failed sources", before: "", after: `${current.sources.filter(source => source.status === "succeeded").length} / ${current.sources.filter(source => source.status === "failed").length}` }] };
      }
      const selected = proposal.action === "gather" ? current.sources.filter(source => source.status === "pending") : current.sources.filter(source => source.id === proposal.sourceId && source.status === "failed");
      if (!selected.length || proposal.action === "retry" && selected.length !== 1) throw new Error("reference_request_refused");
      const updates = new Map<string, typeof current.sources[number]>();
      for (const source of selected) {
        if (signal.aborted) throw new Error("reference_request_refused");
        try { const text = await read(source.url, signal); if (new TextEncoder().encode(text).byteLength > 65536 || !text.trim()) throw new Error("reference_source_invalid"); updates.set(source.id, { ...source, text, status: "succeeded", error: "" }); }
        catch { if (signal.aborted) throw new Error("reference_request_refused"); updates.set(source.id, { ...source, text: "", status: "failed", error: "The configured primary source could not be read within its size/time limits." }); }
      }
      const sources = current.sources.map(source => updates.get(source.id) ?? source), failed = sources.some(source => source.status === "failed");
      return { state: { ...current, sources, status: failed ? "partial" as const : "gathered" as const }, action: proposal.action, title: proposal.action === "gather" ? "Save gathered source results" : "Save the selected source retry",
        description: "Review the complete returned source text and any failures before saving. No silent truncation or automatic retry occurs.", riskLevel: "low",
        changes: selected.map(source => ({ label: source.title, before: source.status, after: updates.get(source.id)!.status })) };
    },
  }, options);
}
