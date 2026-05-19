import { providerErrorMessage } from "./errors";
import { parseHumanizeResponse } from "./prompting";

export type ProviderId = "cerebras" | "groq" | "ollama-cloud" | "ollama-local";

export type ProviderPayloadInput = {
  model: string;
  system: string;
  prompt: string;
  temperature: number;
};

export type OllamaPayloadInput = ProviderPayloadInput;

export type HumanizeLocalOllamaInput = OllamaPayloadInput & {
  baseUrl: string;
};

export type HumanizeCloudInput = ProviderPayloadInput & {
  apiKey: string;
};

export type HumanizeResult = {
  finalText: string;
  remainingTells: string[];
  usage: Record<string, unknown>;
  provider: ProviderId;
  model: string;
};

export function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || "http://localhost:11434/api").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

export function buildOllamaPayload(input: OllamaPayloadInput) {
  return {
    model: input.model,
    system: input.system,
    prompt: input.prompt,
    stream: false,
    format: "json",
    think: input.model.toLowerCase().includes("gpt-oss") ? "low" : false,
    keep_alive: "15m",
    options: {
      temperature: input.temperature
    }
  };
}

export function buildOllamaCloudPayload(input: ProviderPayloadInput) {
  const isReasoningModel = input.model.toLowerCase().includes("gpt-oss");
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt }
    ],
    stream: false,
    format: "json",
    ...(isReasoningModel ? { think: "low" } : {}),
    options: {
      temperature: input.temperature
    }
  };
}

export function buildCerebrasPayload(input: ProviderPayloadInput) {
  // Cerebras hosts gpt-oss-120b at ~3000 t/s with an OpenAI-compatible API.
  // Free tier: 1M tokens/day, ~64K TPM — much more headroom than Groq's 8K.
  // - reasoning_effort "low" keeps reasoning tokens small for humanization tasks
  // - Dynamic max_completion_tokens based on input length
  const isReasoningModel = /gpt-oss|deepseek.*r1|r1(?:-|$)/i.test(input.model);
  const wordCount = input.prompt.split(/\s+/).length;
  const estimatedInputTokens = 800 + Math.ceil(wordCount * 1.3);
  const safeMaxTokens = Math.min(Math.max(1024, Math.ceil(estimatedInputTokens * 1.5)), 8192);

  return {
    model: input.model,
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.prompt }
    ],
    stream: false,
    temperature: input.temperature,
    max_completion_tokens: safeMaxTokens,
    ...(isReasoningModel
      ? { reasoning_effort: "low" as const }
      : {}),
  };
}

export function buildGroqPayload(input: ProviderPayloadInput) {
  // Reasoning models (gpt-oss, deepseek-r1) emit <think> blocks that break
  // Groq's json_object enforcer. For these we omit response_format and rely on
  // parseHumanizeResponse to extract JSON from free-form output.
  // Groq free tier for gpt-oss-120b has only 8K TPM — dynamic token budgeting is critical.
  const isReasoningModel = /gpt-oss|deepseek.*r1|r1(?:-|$)/i.test(input.model);
  const wordCount = input.prompt.split(/\s+/).length;
  const estimatedInputTokens = 800 + Math.ceil(wordCount * 1.3);
  const safeMaxTokens = Math.min(Math.max(1024, Math.ceil(estimatedInputTokens * 1.5)), 4096);

  return {
    model: input.model,
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.prompt }
    ],
    stream: false,
    temperature: input.temperature,
    ...(isReasoningModel
      ? {
          max_completion_tokens: safeMaxTokens,
          reasoning_effort: "low" as const,
        }
      : {
          max_completion_tokens: safeMaxTokens,
          response_format: { type: "json_object" as const },
        }),
  };
}

// ---------------------------------------------------------------------------
// Provider handlers
// ---------------------------------------------------------------------------

export async function humanizeWithOllama(input: HumanizeLocalOllamaInput): Promise<HumanizeResult> {
  const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOllamaPayload(input))
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama request failed with ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const parsed = parseHumanizeResponse(String(payload.response ?? ""));
  const usageKeys = ["total_duration", "load_duration", "prompt_eval_count", "eval_count", "eval_duration"];
  const usage = Object.fromEntries(usageKeys.filter((key) => key in payload).map((key) => [key, payload[key]]));

  return {
    ...parsed,
    usage,
    provider: "ollama-local",
    model: input.model
  };
}

export async function humanizeWithOllamaCloud(input: HumanizeCloudInput): Promise<HumanizeResult> {
  if (!input.apiKey) {
    throw new Error("OLLAMA_API_KEY is missing.");
  }

  const response = await fetch("https://ollama.com/api/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildOllamaCloudPayload(input))
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama Cloud request failed with ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const message = payload.message as { content?: unknown } | undefined;
  const contentRaw = message?.content ?? payload.response ?? "";
  const parsed = typeof contentRaw === "object" && contentRaw !== null
    ? extractFromObject(contentRaw as Record<string, unknown>)
    : parseHumanizeResponse(String(contentRaw));

  if (!parsed.finalText) {
    throw new Error("Ollama Cloud returned empty content.");
  }

  return {
    ...parsed,
    usage: pickUsage(payload),
    provider: "ollama-cloud",
    model: input.model
  };
}

export async function humanizeWithCerebras(input: HumanizeCloudInput): Promise<HumanizeResult> {
  if (!input.apiKey) {
    throw new Error("CEREBRAS_API_KEY is missing.");
  }

  const cerebrasPayload = buildCerebrasPayload(input);
  console.log("[Cerebras] Sending request:", {
    model: input.model,
    reasoning_effort: (cerebrasPayload as Record<string, unknown>).reasoning_effort,
    max_completion_tokens: cerebrasPayload.max_completion_tokens,
    temperature: cerebrasPayload.temperature,
  });

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(cerebrasPayload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.log("[Cerebras] HTTP error:", response.status, detail.slice(0, 500));
    throw new Error(detail || `Cerebras request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>;
    usage?: Record<string, unknown>;
  };

  const rawContent = String(payload.choices?.[0]?.message?.content ?? "");
  console.log("[Cerebras] Response:", {
    content_length: rawContent.length,
    content_preview: rawContent.slice(0, 200),
    usage: payload.usage,
  });

  const parsed = parseHumanizeResponse(rawContent);

  if (!parsed.finalText) {
    console.log("[Cerebras] Parsed output is EMPTY. Raw content:", rawContent.slice(0, 500));
    throw new Error("Cerebras returned empty content after parsing.");
  }

  return {
    ...parsed,
    usage: payload.usage ?? {},
    provider: "cerebras",
    model: input.model
  };
}

export async function humanizeWithGroq(input: HumanizeCloudInput): Promise<HumanizeResult> {
  if (!input.apiKey) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  const groqPayload = buildGroqPayload(input);
  console.log("[Groq] Sending request:", {
    model: input.model,
    reasoning_effort: (groqPayload as Record<string, unknown>).reasoning_effort,
    max_completion_tokens: groqPayload.max_completion_tokens,
    temperature: groqPayload.temperature,
  });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(groqPayload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.log("[Groq] HTTP error:", response.status, detail.slice(0, 500));
    throw new Error(detail || `Groq request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: Record<string, unknown>;
  };

  const rawContent = String(payload.choices?.[0]?.message?.content ?? "");
  console.log("[Groq] Response:", {
    content_length: rawContent.length,
    content_preview: rawContent.slice(0, 200),
    usage: payload.usage,
  });

  const parsed = parseHumanizeResponse(rawContent);

  if (!parsed.finalText) {
    console.log("[Groq] Parsed output is EMPTY. Raw content:", rawContent.slice(0, 500));
    throw new Error("Groq returned empty content after parsing.");
  }

  return {
    ...parsed,
    usage: payload.usage ?? {},
    provider: "groq",
    model: input.model
  };
}

// ---------------------------------------------------------------------------
// 3-provider fallback chain
// ---------------------------------------------------------------------------

export async function humanizeWithFallbacks(input: {
  system: string;
  prompt: string;
  temperature: number;
  primaryProvider: ProviderId;
  cerebrasApiKey: string;
  groqApiKey: string;
  ollamaApiKey: string;
  cerebrasModel: string;
  groqModel: string;
  ollamaCloudModel: string;
}): Promise<HumanizeResult & { fallbackErrors: string[] }> {
  // Build provider chain based on the user's primary provider selection.
  const chains: Record<string, string[]> = {
    "cerebras": ["cerebras", "ollama-cloud", "groq"],
    "ollama-cloud": ["ollama-cloud", "cerebras", "groq"],
    "groq": ["groq", "cerebras", "ollama-cloud"],
  };
  const providers = chains[input.primaryProvider] ?? chains["cerebras"];
  const fallbackErrors: string[] = [];

  for (const provider of providers) {
    try {
      let result: HumanizeResult;
      if (provider === "cerebras") {
        result = await humanizeWithCerebras({
          apiKey: input.cerebrasApiKey,
          model: input.cerebrasModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature,
        });
      } else if (provider === "groq") {
        result = await humanizeWithGroq({
          apiKey: input.groqApiKey,
          model: input.groqModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature,
        });
      } else {
        result = await humanizeWithOllamaCloud({
          apiKey: input.ollamaApiKey,
          model: input.ollamaCloudModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature,
        });
      }
      return { ...result, fallbackErrors };
    } catch (error) {
      const msg = `${provider}: ${providerErrorMessage(error)}`;
      console.log(`[Fallback] ${msg}`);
      fallbackErrors.push(msg);
    }
  }

  throw new Error(fallbackErrors.join(" | "));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickUsage(payload: Record<string, unknown>): Record<string, unknown> {
  const usageKeys = ["total_duration", "load_duration", "prompt_eval_count", "eval_count", "eval_duration", "prompt_eval_duration"];
  return Object.fromEntries(usageKeys.filter((key) => key in payload).map((key) => [key, payload[key]]));
}

function extractFromObject(obj: Record<string, unknown>): { finalText: string; remainingTells: string[] } {
  const finalText = String(obj.final_text ?? obj.finalText ?? obj.text ?? "").trim();
  const tellsRaw = obj.remaining_tells ?? obj.remainingTells ?? [];
  const remainingTells = Array.isArray(tellsRaw)
    ? tellsRaw.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return { finalText, remainingTells };
}
