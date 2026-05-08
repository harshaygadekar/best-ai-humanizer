import { describe, expect, it } from "vitest";
import { buildGroqPayload, buildOllamaCloudPayload, buildOllamaPayload, normalizeBaseUrl } from "../lib/providers";

describe("providers", () => {
  it("normalizes Ollama base URLs without trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:11434/api///")).toBe("http://localhost:11434/api");
  });

  it("matches the desktop Ollama generate payload shape", () => {
    const payload = buildOllamaPayload({
      model: "qwen2.5:14b",
      system: "system",
      prompt: "user",
      temperature: 0.1
    });

    expect(payload).toMatchObject({
      model: "qwen2.5:14b",
      system: "system",
      prompt: "user",
      stream: false,
      format: "json",
      keep_alive: "15m",
      options: { temperature: 0.1 }
    });
    expect(payload.think).toBe(false);
  });

  it("builds a fast non-reasoning Groq chat payload", () => {
    const payload = buildGroqPayload({
      model: "llama-3.1-8b-instant",
      system: "system",
      prompt: "user",
      temperature: 0.1
    });

    expect(payload).toMatchObject({
      model: "llama-3.1-8b-instant",
      stream: false,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    expect(payload.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" }
    ]);
  });

  it("builds an Ollama Cloud chat payload with thinking disabled", () => {
    const payload = buildOllamaCloudPayload({
      model: "gpt-oss:120b",
      system: "system",
      prompt: "user",
      temperature: 0.1
    });

    expect(payload).toMatchObject({
      model: "gpt-oss:120b",
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1 }
    });
  });
});
