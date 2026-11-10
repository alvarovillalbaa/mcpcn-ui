import { z } from "zod";

export const DocumentKindSchema = z.enum(["invoice", "contract", "resume"]);
export const DocumentStateSchema = z.object({ status: z.enum(["empty", "extracted", "saved"]), fileName: z.string().max(200), kind: DocumentKindSchema, text: z.string().max(65536),
  fields: z.array(z.object({ id: z.string().regex(/^[a-z-]+$/), label: z.string().min(1).max(200), original: z.string().max(4000), value: z.string().max(4000), required: z.boolean(), confidence: z.number().min(0).max(1), source: z.string().max(8000) }).strict()).max(20),
}).strict();
export const DocumentProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extract"), fileName: z.string().min(1).max(200).regex(/\.(txt|md)$/i), kind: DocumentKindSchema, text: z.string().min(1).max(65536) }).strict(),
  z.object({ action: z.literal("save"), fields: z.array(z.object({ id: z.string(), value: z.string().max(4000) }).strict()).min(1).max(20) }).strict(),
]);
export const documentSeed: z.input<typeof DocumentStateSchema> = { status: "empty", fileName: "", kind: "invoice", text: "", fields: [] };
export function extractAuthoredInvoiceFields(text: string) {
  return { supplier: /^Supplier:[ \t]*(.*)$/mi.exec(text)?.[1] ?? "", total: /^Total:[ \t]*(.*)$/mi.exec(text)?.[1] ?? "" };
}
export function extractTextFields(kind: z.infer<typeof DocumentKindSchema>, text: string) {
  if (new TextEncoder().encode(text).byteLength > 65536) throw new Error("reference_document_too_large");
  const labels = { invoice: ["Supplier", "Total", "Currency"], contract: ["Party", "Effective date", "Term"], resume: ["Name", "Email", "Experience"] }[kind];
  return labels.map(label => {
    const match = new RegExp(`^${label}:[ \\t]*(.*)$`, "mi").exec(text), value = match?.[1]?.replace(/\r$/, "") ?? "";
    if (value.length > 4000) throw new Error("reference_document_field_too_large");
    return { id: label.toLowerCase().replaceAll(" ", "-"), label, original: value, value, required: true, confidence: match ? 1 : 0,
      source: match ? match[0].replace(/\r$/, "") : `No ${label}: line was found.` };
  });
}
