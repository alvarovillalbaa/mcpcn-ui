import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { DecisionNarrativeDemo } from "./decision-narrative-demos.js";
import { decisionNarrativeExamples, decisionNarrativeExampleCode, decisionNarrativeNames, type DecisionNarrativeSlug } from "./decision-narrative-examples.js";

describe("T2 decision narrative documentation", () => {
  it.each(Object.keys(decisionNarrativeExamples) as DecisionNarrativeSlug[])("DN-D01 %s has a real typed demo and complete readable JSON", slug => {
    expect(schemaBySlug[slug].safeParse(decisionNarrativeExamples[slug]).success).toBe(true);
    expect(decisionNarrativeExampleCode(slug)).toContain(`const data: ${decisionNarrativeNames[slug]}Data`);
    const output = renderToStaticMarkup(<DecisionNarrativeDemo kind={slug} />);
    expect(output).toContain(`${decisionNarrativeNames[slug]} demonstration`); expect(output).toContain("Request report review");
    expect(output).toContain("COMPLETE_VALUE_END"); expect(output).toContain('aria-label="Decision intent count"'); expect(output).not.toContain("is invalid");
  });
});
