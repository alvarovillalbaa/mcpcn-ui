"use client";
import { useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { Button, Card } from "@mcpcn/react";
import { WorkflowFrame, useReferenceWorkflow } from "@mcpcn/reference-workflows/client";
import { CheckoutStateSchema, checkoutSeed, quoteTotal, money } from "./contracts.js";
export const fixture = checkoutSeed;
function CheckoutReview() {
  const controller = useReferenceWorkflow("ecommerce-checkout-review", CheckoutStateSchema), [address, setAddress] = useState(""), [terms, setTerms] = useState(false);
  const state = controller.view?.state;
  return <WorkflowFrame controller={controller} title="Checkout review">{state && <>
    <Card><section className="reference-section"><h2>{state.merchant}</h2><p>Record a local uncharged order after reviewing its exact quote. No card, payment provider or fulfilment service is connected.</p>
      <div className="reference-table"><table><caption>Server-owned quote</caption><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Subtotal</th></tr></thead><tbody>{state.items.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.quantity}</td><td>{money(item.unitMinor)}</td><td>{money(item.unitMinor * item.quantity)}</td></tr>)}</tbody></table></div>
      <dl><dt>Shipping</dt><dd>{money(state.shippingMinor)}</dd><dt>Tax</dt><dd>{money(state.taxMinor)}</dd><dt>Total</dt><dd>{money(quoteTotal(state))}</dd><dt>Quote expires</dt><dd>{new Date(state.expiresAt).toISOString()}</dd></dl></section></Card>
    <Card><section className="reference-section"><h2>Return terms</h2><p>{state.returnTerms}</p></section></Card>
    {state.order ? <Card><section className="reference-section"><h2>Order recorded</h2><p aria-label="Recorded order">{state.order.id}</p><p>{state.order.address}</p><p>{money(state.order.totalMinor)} · charged: {String(state.order.charged)}</p></section></Card> :
      <form className="reference-form" aria-label="Checkout details" onSubmit={event => { event.preventDefault(); void controller.prepare({ action: "place-order", address, acceptReturns: terms }); }}><fieldset disabled={controller.busy || !controller.ready}><legend>Prepare checkout review</legend>
        <Button type="button" onClick={() => void controller.prepare({ action: "refresh-quote" })}>Review quote refresh</Button>
        <label>Delivery address<textarea aria-label="Delivery address" minLength={10} maxLength={2000} required value={address} onChange={event => { setAddress(event.currentTarget.value); controller.clearReview(); }} /></label>
        <label className="reference-check"><input type="checkbox" aria-label="Accept the stated return terms" required checked={terms} onChange={event => { setTerms(event.currentTarget.checked); controller.clearReview(); }} />I accept the stated return terms.</label>
        <Button type="submit">Review uncharged order</Button></fieldset></form>}
  </>}</WorkflowFrame>;
}
export function App() { const [adapter] = useState(() => new OfficialMCPAdapter()); return <AgentAppProvider adapter={adapter}><CheckoutReview /></AgentAppProvider>; }
