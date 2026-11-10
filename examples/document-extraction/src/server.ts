import { createWorkflowServer, type ServerOptions } from "@mcpcn/reference-workflows/server";
import { DocumentStateSchema, DocumentProposalSchema, extractTextFields } from "./contracts.js";

export function createServer(options: ServerOptions) {
  return createWorkflowServer({ workflow: "document-extraction", title: "document extraction", stateSchema: DocumentStateSchema, proposalSchema: DocumentProposalSchema,
    propose(current, proposal) {
      if (proposal.action === "extract") {
        const fields = extractTextFields(proposal.kind, proposal.text);
        return { state: { status: "extracted" as const, fileName: proposal.fileName, kind: proposal.kind, text: proposal.text, fields }, action: "extract", title: "Save the extracted text review",
          description: "Exact labeled-line extraction from the explicitly supplied UTF-8 text. Confidence indicates a matching line, not semantic correctness. No OCR or model is used.", riskLevel: "medium",
          changes: [{ label: "Source document", before: current.fileName, after: proposal.fileName }, ...fields.map(field => ({ label: field.label, before: "", after: field.value || "Missing — correct before saving" }))] };
      }
      if (current.status !== "extracted" || new Set(proposal.fields.map(field => field.id)).size !== current.fields.length || proposal.fields.length !== current.fields.length) throw new Error("reference_request_refused");
      const fields = current.fields.map(field => {
        const supplied = proposal.fields.find(value => value.id === field.id);
        if (!supplied || field.required && !supplied.value.trim()) throw new Error("reference_request_refused");
        return { ...field, value: supplied.value };
      });
      return { state: { ...current, status: "saved" as const, fields }, action: "save", title: "Save corrected document fields",
        description: "Persist these exact reviewed values with their original source text and an audit event in the private local workspace.", riskLevel: "medium",
        changes: fields.map(field => ({ label: field.label, before: field.original, after: field.value })) };
    },
  }, options);
}
