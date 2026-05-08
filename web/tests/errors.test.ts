import { describe, expect, it } from "vitest";
import { providerErrorMessage } from "../lib/errors";

describe("provider errors", () => {
  it("explains hosted provider connection failures", () => {
    const message = providerErrorMessage(new Error("fetch failed"));

    expect(message).toContain("hosted inference provider");
  });

  it("explains missing provider keys", () => {
    const message = providerErrorMessage(new Error("GROQ_API_KEY is missing."));

    expect(message).toContain("GROQ_API_KEY");
    expect(message).toContain("OLLAMA_API_KEY");
  });
});
