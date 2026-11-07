import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const ChangeSchema = z.object({
  label: z.string(),
  before: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  after: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  affectedCount: z.number().int().nonnegative().optional()
});
export const SchemaFieldSchema = z.object({
  name: z.string(), label: z.string(), type: z.enum(["text", "textarea", "number", "email", "select", "boolean"]),
  description: z.string().optional(), required: z.boolean().default(false), value: z.unknown().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
