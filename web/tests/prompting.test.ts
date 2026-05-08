import { describe, expect, it } from "vitest";
import { buildHumanizePrompt, getModeById, parseHumanizeResponse } from "../lib/prompting";

describe("prompting", () => {
  it("builds a strict JSON prompt with the selected category instructions", () => {
    const prompt = buildHumanizePrompt({
      text: "This innovative platform leverages AI to transform workflows.",
      modeId: "academic",
      temperature: 0.1
    });

    expect(prompt.system).toContain("Return only valid JSON");
    expect(prompt.system).toContain("academic");
    expect(prompt.user).toContain("This innovative platform");
  });

  it("falls back to Free mode for unknown categories", () => {
    expect(getModeById("missing").id).toBe("standard");
  });

  it("parses fenced JSON and strips audit labels from final text", () => {
    const parsed = parseHumanizeResponse('```json\n{"final_text":"Final version:\\nThis is cleaner.","remaining_tells":["none"]}\n```');

    expect(parsed.finalText).toBe("This is cleaner.");
    expect(parsed.remainingTells).toEqual([]);
  });
});
