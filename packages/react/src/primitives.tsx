"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type * as React from "react";
import { cn } from "@mcpcn/core";

export function Button({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={cn("mcpcn mcpcn-button", className)} {...props}>{children}</button>; }
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) { return <section className={cn("mcpcn mcpcn-card", className)} {...props}>{children}</section>; }
export function Badge({ children, risk }: { children: ReactNode; risk?: string }) { return <span className="mcpcn mcpcn-badge" data-risk={risk}>{children}</span>; }
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("mcpcn mcpcn-input", props.className)} {...props} />; }
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn("mcpcn mcpcn-input", props.className)} {...props} />; }
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn("mcpcn mcpcn-input", props.className)} {...props} />; }
export function Alert({ title, children }: { title: string; children?: ReactNode }) { return <div className="mcpcn mcpcn-error" role="alert"><strong>{title}</strong>{children && <div>{children}</div>}</div>; }
export function Skeleton({ className }: { className?: string }) { return <span className={cn("mcpcn", className)} aria-label="Loading" style={{ display: "block", height: 16, borderRadius: 8, background: "var(--mcpcn-line)" }} />; }
export function EmptyState({ title = "Nothing here yet", description }: { title?: string; description?: string }) { return <Card><div className="mcpcn-body" style={{ textAlign: "center" }}><h3 className="mcpcn-title">{title}</h3>{description && <p className="mcpcn-description">{description}</p>}</div></Card>; }
export function Tabs({ items, value, onValueChange, label = "Sections" }: { items: Array<{ value: string; label: string; content: ReactNode }>; value?: string; onValueChange?: (value: string) => void; label?: string }) {
  const id = useId();
  const [local, setLocal] = useState(value ?? items[0]?.value);
  const selected = items.findIndex(item => item.value === (value ?? local));
  const active = selected < 0 ? 0 : selected;
  useEffect(() => {
    if (value === undefined && selected < 0) setLocal(items[0]?.value);
  }, [items, selected, value]);
  const select = (next: string) => { setLocal(next); onValueChange?.(next); };
  return <div className="mcpcn">
    <div className="mcpcn-row" role="tablist" aria-label={label} aria-orientation="horizontal">
      {items.map((item, index) => <Button key={item.value}
        type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
        aria-selected={active === index} tabIndex={active === index ? 0 : -1}
        data-variant={active === index ? undefined : "secondary"}
        onClick={() => select(item.value)} onKeyDown={event => {
          let next: number;
          switch (event.key) {
            case "ArrowLeft": next = (index - 1 + items.length) % items.length; break;
            case "ArrowRight": next = (index + 1) % items.length; break;
            case "Home": next = 0; break;
            case "End": next = items.length - 1; break;
            default: return;
          }
          event.preventDefault();
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          select(items[next]!.value);
        }}>{item.label}</Button>)}
    </div>
    {items.map((item, index) => <div key={item.value} role="tabpanel" id={`${id}-panel-${index}`}
      aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0} style={{ marginTop: 12 }}>
      {active === index ? item.content : null}
    </div>)}
  </div>;
}

type DialogProps = { open: boolean; title: string; children: ReactNode; onClose: () => void };
export function Dialog(props: DialogProps) {
  return props.open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({ title, children, onClose }: DialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Close before unmount removes the dialog, so native focus restoration still applies.
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    heading.current?.focus();
    return () => { element.close(); };
  }, []);
  return <dialog ref={dialog} className="mcpcn mcpcn-dialog" aria-labelledby={id} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <Card>
      <div className="mcpcn-header mcpcn-row mcpcn-between">
        <h2 ref={heading} id={id} className="mcpcn-title" tabIndex={-1}>{title}</h2>
        <Button type="button" data-variant="secondary" onClick={onClose} aria-label="Close">×</Button>
      </div>
      <div className="mcpcn-body">{children}</div>
    </Card>
  </dialog>;
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="mcpcn" title={label} aria-label={label}>{children}</span>; }
export function InvalidPayload({ title, issues, value }: { title?: string; issues?: string[]; value?: unknown }) { return <div className="mcpcn mcpcn-error" role="alert"><strong>{title ?? "This tool result could not be rendered"}</strong><p className="mcpcn-description">Check the component schema and structuredContent payload.</p>{issues?.length ? <ul>{issues.map((i, n) => <li key={n}>{i}</li>)}</ul> : null}{value !== undefined && <details><summary>Developer details</summary><pre className="mcpcn-code">{JSON.stringify(value, null, 2)}</pre></details>}</div>; }
