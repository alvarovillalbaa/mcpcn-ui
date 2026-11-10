import type { BillingGateData, UnsupportedHostNoticeData, NoDataStateData, LoadingBridgeStateData, OfflineStateData, PermissionDeniedStateData, ExpiredSessionStateData } from "@mcpcn/schemas";

const common = { revision: "1", message: "Authored consumer report; no live state was checked.", reportedAt: "2026-11-10T00:00:00Z", action: { id: "review", revision: "1", label: "Request consumer review", available: true } };
export const hostStateExamples = {
  "billing-gate": { ...common, id: "billing-1", state: "billing-required", title: "Reported billing restriction", featureLabel: "Authored export", currentPlan: "Authored basic plan", requiredPlan: "Authored extended plan" },
  "unsupported-host-notice": { ...common, id: "host-1", state: "unsupported-host", title: "Reported host requirements", hostLabel: "Authored host", requirements: [{ id: "resize", revision: "1", label: "App view resizing", reportedSupport: "missing" }, { id: "modal", revision: "1", label: "Native modal display", reportedSupport: "unknown" }] },
  "no-data-state": { ...common, id: "data-1", state: "empty", title: "Reported empty collection", collectionLabel: "Authored records", reason: "no-matches", querySummary: "Authored query <not executable>" },
  "loading-bridge-state": { ...common, id: "bridge-1", state: "waiting", title: "Reported bridge wait", bridgeLabel: "Authored app bridge", phase: "awaiting-host", elapsedMs: 0, progress: { completed: 0, total: 3 } },
  "offline-state": { ...common, id: "offline-1", state: "offline", title: "Reported offline service", serviceLabel: "Authored record service", unsentChanges: 0 },
  "permission-denied-state": { ...common, id: "denied-1", state: "denied", title: "Reported denied access", resourceLabel: "Authored collection", requesterLabel: "Authored review assistant", scopes: [{ id: "records.read", revision: "1", label: "Read authored records" }] },
  "expired-session-state": { ...common, id: "session-1", state: "expired", title: "Reported expired session", serviceLabel: "Authored workspace", expiredAt: "2026-11-09T23:00:00Z" },
} satisfies {
  "billing-gate": BillingGateData; "unsupported-host-notice": UnsupportedHostNoticeData; "no-data-state": NoDataStateData;
  "loading-bridge-state": LoadingBridgeStateData; "offline-state": OfflineStateData; "permission-denied-state": PermissionDeniedStateData; "expired-session-state": ExpiredSessionStateData;
};
export type HostStateSlug = keyof typeof hostStateExamples;
export const hostStateNames = { "billing-gate": "BillingGate", "unsupported-host-notice": "UnsupportedHostNotice", "no-data-state": "NoDataState", "loading-bridge-state": "LoadingBridgeState", "offline-state": "OfflineState", "permission-denied-state": "PermissionDeniedState", "expired-session-state": "ExpiredSessionState" } as const;
export function hostStateExampleCode(slug: HostStateSlug) {
  return `import { ${hostStateNames[slug]} } from "@mcpcn/react";\nimport type { ${hostStateNames[slug]}Data } from "@mcpcn/schemas";\n\nconst data: ${hostStateNames[slug]}Data = ${JSON.stringify(hostStateExamples[slug], null, 2)};\n\n<${hostStateNames[slug]} {...data} onAction={action => console.log(action)} />`;
}
