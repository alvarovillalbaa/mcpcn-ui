import { randomUUID } from "node:crypto";
import { createWorkflowServer, type ServerOptions } from "@mcpcn/reference-workflows/server";
import { CheckoutStateSchema, CheckoutProposalSchema, quoteTotal, money } from "./contracts.js";

export function createServer(options: ServerOptions, now: () => number = Date.now) {
  return createWorkflowServer({ workflow: "ecommerce-checkout-review", title: "checkout review", stateSchema: CheckoutStateSchema, proposalSchema: CheckoutProposalSchema,
    propose(current, proposal) {
      if (proposal.action === "refresh-quote") {
        if (current.status !== "quote") throw new Error("reference_request_refused");
        const expiresAt = now() + 86400000;
        return { state: { ...current, expiresAt }, action: "refresh-quote", title: "Refresh the local reference quote", description: "Renew the server-owned reference prices for one day. No merchant, payment or shipping provider is contacted.", riskLevel: "low",
          changes: [{ label: "Quote expiry", before: new Date(current.expiresAt).toISOString(), after: new Date(expiresAt).toISOString() }] };
      }
      if (current.status !== "quote" || current.expiresAt <= now()) throw new Error("reference_request_refused");
      const totalMinor = quoteTotal(current);
      return { state: { ...current, status: "ordered" as const, order: { id: randomUUID(), address: proposal.address, totalMinor, charged: false as const } },
        action: "record-order", title: `Record the reviewed ${money(totalMinor)} order`, description: `Local reference order only. No card is charged and no fulfilment request is sent. ${current.returnTerms}`, riskLevel: "high",
        changes: [...current.items.map(item => ({ label: `${item.name} × ${item.quantity}`, before: "Not ordered", after: money(item.unitMinor * item.quantity) })),
          { label: "Shipping", before: "", after: money(current.shippingMinor) }, { label: "Tax", before: "", after: money(current.taxMinor) }, { label: "Total", before: "", after: money(totalMinor) },
          { label: "Delivery address", before: "", after: proposal.address }] };
    },
    validateCommit(current, proposed) {
      if (current.status !== "quote") throw new Error("reference_request_refused");
      if (proposed.status === "quote") { if (proposed.expiresAt <= now() || proposed.order !== null || quoteTotal(proposed) !== quoteTotal(current)) throw new Error("reference_request_refused"); }
      else if (current.expiresAt <= now() || proposed.order?.totalMinor !== quoteTotal(current)) throw new Error("reference_request_refused");
    },
  }, options);
}
