import { z } from "zod";
import { PrivacyBoundaryCardSchema } from "@mcpcn/schemas";
import { createStructuredResult } from "@mcpcn/server";

// Advertise this model-safe DATA schema when registering this particular tool.
export const PublicReviewSchema = z.object({
  reviewId: z.string(), revision: z.string(), state: z.enum(["ready", "loading", "empty", "error"]),
}).strict();

// Call only after your server has authorized access to the supplied review.
export function createPrivateReviewResult(candidate: unknown) {
  const review = PrivacyBoundaryCardSchema.parse(candidate);
  const publicData = PublicReviewSchema.parse({ reviewId: review.id, revision: review.revision, state: review.state });
  return createStructuredResult("privacy-boundary-card", publicData, {
    text: "A privacy review is available in the app.",
    meta: { "example/private-review": review },
  });
}
// The app explicitly reads meta["example/private-review"] from useAgentApp(),
// validates it with PrivacyBoundaryCardSchema and renders the private review.
// That key is an example application convention, not automatic library routing.
