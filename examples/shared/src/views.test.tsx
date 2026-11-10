// T2: server rendering only; no provider, socket, file read or mutation on mount.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App as Candidate } from "../../hr-candidate-review/src/app.js";
import { App as Document } from "../../document-extraction/src/app.js";
import { App as Checkout } from "../../ecommerce-checkout-review/src/app.js";
import { App as Admin } from "../../admin-settings-change/src/app.js";
import { App as Research } from "../../research-workflow/src/app.js";

describe("T2 real reference app initial surfaces", () => {
  it.each([["candidate", Candidate], ["document", Document], ["checkout", Checkout], ["admin", Admin], ["research", Research]] as const)("RF-V01 %s waits for an actual server record", (_name, App) => {
    const html = renderToStaticMarkup(<App />); expect(html).toContain("Connect this app through the reference workbench or an authorized MCP host."); expect(html).toContain("Reload record");
    expect(html).toContain("disabled"); expect(html).not.toContain("Confirm reviewed change"); expect(html).not.toContain("Authored candidate"); expect(html).not.toContain("GenericAgentComponent");
  });
});
