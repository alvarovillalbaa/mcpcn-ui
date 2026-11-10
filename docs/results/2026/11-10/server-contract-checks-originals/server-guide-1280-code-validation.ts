import { ApprovalCardSchema } from "@mcpcn/schemas";
import { validateToolResult } from "@mcpcn/server";

export async function inspectResult(candidate: unknown) {
  const checked = await validateToolResult("approval-card", ApprovalCardSchema, candidate);
  if (!checked.success) throw new Error("The supplied tool result is invalid.");
  return checked.data;
}
