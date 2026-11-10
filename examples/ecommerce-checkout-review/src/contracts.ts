import { z } from "zod";

const amount = z.number().int().min(0).max(100000000);
export const CheckoutStateSchema = z.object({ status: z.enum(["quote", "ordered"]), currency: z.literal("EUR"), merchant: z.string().min(1).max(200),
  items: z.array(z.object({ id: z.string(), name: z.string().min(1).max(200), unitMinor: amount, quantity: z.number().int().min(1).max(100) }).strict()).min(1).max(20),
  shippingMinor: amount, taxMinor: amount, returnTerms: z.string().min(1).max(3000), expiresAt: z.number().int().positive(),
  order: z.object({ id: z.string(), address: z.string().min(10).max(2000), totalMinor: amount, charged: z.literal(false) }).strict().nullable(),
}).strict();
export const CheckoutProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("place-order"), address: z.string().trim().min(10).max(2000), acceptReturns: z.literal(true) }).strict(),
  z.object({ action: z.literal("refresh-quote") }).strict(),
]);
export function quoteTotal(state: z.infer<typeof CheckoutStateSchema>) {
  const total = state.items.reduce((sum, item) => sum + item.unitMinor * item.quantity, 0) + state.shippingMinor + state.taxMinor;
  return amount.parse(total);
}
export const money = (minor: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(minor / 100);
export const checkoutSeed = (now = Date.now()): z.input<typeof CheckoutStateSchema> => ({ status: "quote", currency: "EUR", merchant: "Authored reference shop",
  items: [{ id: "notebook", name: "Reference notebook", unitMinor: 1800, quantity: 2 }, { id: "pen", name: "Reference pen", unitMinor: 500, quantity: 1 }],
  shippingMinor: 500, taxMinor: 0, returnTerms: "Return unused items within 30 days. The buyer pays return shipping. This local reference order has no payment or fulfilment provider.", expiresAt: now + 86400000, order: null });
