import type { SourceListData, EvidenceDrawerData } from "@mcpcn/schemas";

export const authoredEvidenceSource = {
  id: "note-a", revision: "1", label: "Authored research note",
  url: "https://example.com/supplied-note", excerpt: "Authored excerpt <em>kept as text</em>. END-EXCERPT",
  supports: ["A supplied claim; not independently verified.", "END-SUPPORT"],
};
export const authoredSourceList = {
  id: "sources-1", revision: "1", title: "Supplied research sources", state: "ready",
  sources: [authoredEvidenceSource, { id: "note-b", revision: "1", label: "Authored comparison note", excerpt: "A second authored source.", supports: [] }],
  selectedSourceId: null,
} satisfies SourceListData;
export const authoredEvidenceDrawer = {
  id: "evidence-1", revision: "1", title: "Supplied evidence", state: "ready", source: authoredEvidenceSource,
  content: { type: "text", text: "BEGIN-EVIDENCE\nAuthored evidence <script>untrusted()</script> remains plain text.\n" + "Complete supplied evidence line.\n".repeat(80) + "END-EVIDENCE" },
} satisfies EvidenceDrawerData;
export const sourceEvidenceFixtures = { "source-list": authoredSourceList, "evidence-drawer": authoredEvidenceDrawer } as const;
