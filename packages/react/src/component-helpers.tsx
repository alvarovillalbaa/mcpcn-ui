"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentAction, ComponentProps } from "./component-types.js";

/** Parsed component data is JSON-safe; callbacks and UI status are kept outside it. */
export function revisionKey(data: unknown): string {
  const key = JSON.stringify(data);
  if (typeof key !== "string") throw new Error("component_revision_invalid");
  return key;
}

export function Feedback({ busy, error }: { busy?: boolean; error?: string }) {
  return <>{error && <p className="mcpcn-error" role="alert">{error}</p>}
    {busy && <p className="mcpcn-hint" role="status">Working…</p>}</>;
}

/** Dispatch consumer intent; asynchronous work and errors never imply success. */
export function useComponentAction(onAction: ComponentProps<unknown>["onAction"], externalBusy = false) {
  const mounted = useRef(true), active = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string>();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const send = useCallback((action: ComponentAction) => {
    if (!mounted.current || active.current || externalBusy || !onAction) return;
    active.current = true;
    setError(undefined);
    try {
      const result: unknown = onAction(action);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        setPending(true);
        void Promise.resolve(result).catch(() => {
          if (mounted.current) setError("The action could not be completed. Try again.");
        }).finally(() => {
          active.current = false;
          if (mounted.current) setPending(false);
        });
      } else {
        // Synchronous controlled input callbacks must not disable or blur the input.
        active.current = false;
      }
    } catch {
      active.current = false;
      if (mounted.current) setError("The action could not be completed. Try again.");
    }
  }, [externalBusy, onAction]);
  return { send, busy: externalBusy || pending, error };
}
