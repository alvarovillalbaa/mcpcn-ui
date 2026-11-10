import { createServer as hr } from "./hr-candidate-review/src/server.js";
import { createServer as document } from "./document-extraction/src/server.js";
import { createServer as checkout } from "./ecommerce-checkout-review/src/server.js";
import { createServer as admin } from "./admin-settings-change/src/server.js";
import { createServer as research, type SourceReader } from "./research-workflow/src/server.js";
import { CandidateStateSchema, candidateSeed } from "./hr-candidate-review/src/contracts.js";
import { DocumentStateSchema, documentSeed } from "./document-extraction/src/contracts.js";
import { CheckoutStateSchema, checkoutSeed } from "./ecommerce-checkout-review/src/contracts.js";
import { AdminStateSchema, adminSeed } from "./admin-settings-change/src/contracts.js";
import { ResearchStateSchema, researchSeed } from "./research-workflow/src/contracts.js";

export function referenceDefinitions(options: { readSource?: SourceReader; now?: () => number } = {}) {
  return [
    { id: "hr-candidate-review" as const, title: "Candidate review", seed: CandidateStateSchema.parse(candidateSeed), create: hr },
    { id: "document-extraction" as const, title: "Document extraction", seed: DocumentStateSchema.parse(documentSeed), create: document },
    { id: "ecommerce-checkout-review" as const, title: "Checkout review", seed: CheckoutStateSchema.parse(checkoutSeed(options.now?.())), create: (config: Parameters<typeof checkout>[0]) => checkout(config, options.now) },
    { id: "admin-settings-change" as const, title: "Workspace settings", seed: AdminStateSchema.parse(adminSeed), create: admin },
    { id: "research-workflow" as const, title: "Research sources", seed: ResearchStateSchema.parse(researchSeed), create: (config: Parameters<typeof research>[0]) => research(config, options.readSource) },
  ];
}
