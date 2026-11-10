import { z } from "zod";

export const SettingsSchema = z.object({ weeklyDigest: z.boolean(), retentionDays: z.number().int().min(1).max(365) }).strict();
export const AdminStateSchema = z.object({ status: z.enum(["unchanged", "changed", "rolled-back"]), workspaceName: z.string().min(1).max(200), settings: SettingsSchema,
  members: z.array(z.object({ id: z.string(), label: z.string().min(1).max(200) }).strict()).min(1).max(100), previous: SettingsSchema.nullable() }).strict();
export const AdminProposalSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("change"), settings: SettingsSchema }).strict(), z.object({ action: z.literal("rollback") }).strict()]);
export const adminSeed: z.input<typeof AdminStateSchema> = { status: "unchanged", workspaceName: "Local reference workspace", settings: { weeklyDigest: false, retentionDays: 30 },
  members: [{ id: "editor-one", label: "Authored editor" }, { id: "reader-one", label: "Authored reader" }], previous: null };
