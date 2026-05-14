import { providerErrorMessage } from "./errors";
import { parseHumanizeResponse, parseHumanizeObject } from "./prompting";

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
  // Only Ollama reasoning models (gpt-oss) support the `think` parameter.
  const isReasoningModel = input.model.toLowerCase().includes("gpt-oss");
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt }
    ],
    stream: false,
    format: "json",
    ...(isReasoningModel ? { think: false } : {}),
    options: {
      temperature: input.temperature
    }
  };
}

export function buildGroqPayload(input: ProviderPayloadInput) {
  // Reasoning models (gpt-oss, deepseek-r1, etc.) need special handling on Groq:
  // - max_completion_tokens must be kept low due to Groq's 8K TPM limit for gpt-oss
  //   (Groq reserves input_tokens + max_completion_tokens upfront against TPM budget)
  // - reasoning_effort: "low" to minimize tokens spent on chain-of-thought
  // - No response_format since think blocks break json_object enforcement
  const isReasoningModel = /gpt-oss|deepseek.*r1|r1(?:-|$)/i.test(input.model);

  // Estimate input tokens: ~1.3 tokens per word. System prompt + user prompt.
  const inputWords = (input.system + " " + input.prompt).split(/\s+/).length;
  const estimatedInputTokens = Math.ceil(inputWords * 1.3);

  // For humanization, output ≈ input length. We allow 2x the estimated input text tokens
  // (not counting the system prompt) for safety, clamped between 1024 and 4096.
  const userTextWords = input.prompt.split(/\s+/).length;
  const dynamicMaxTokens = Math.min(4096, Math.max(1024, Math.ceil(userTextWords * 1.3 * 2.5)));

  // Ensure total (input + output) stays under 7500 to leave TPM headroom for quick follow-ups
  const safeMaxTokens = Math.min(dynamicMaxTokens, Math.max(1024, 7500 - estimatedInputTokens));

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
          reasoning_effort: "low",
        }
      : {
          max_completion_tokens: safeMaxTokens,
          response_format: { type: "json_object" as const },
        }),
  };
}

export function buildCerebrasPayload(input: ProviderPayloadInput) {
  // Cerebras free tier: 64K TPM for gpt-oss, 60K for others — much more room than Groq's 8K.
  // Model-specific reasoning:
  // - gpt-oss: reasoning_effort "medium" + reasoning_format "parsed" — more reasoning = better
  //   anti-detection quality. "parsed" keeps reasoning in a separate field, keeping content clean.
  // - glm/qwen: reasoning_effort "none" — these models burn too many tokens on reasoning
  //   (GLM used all 1024 tokens on thinking with "low", leaving 0 for content).
  // - Non-reasoning models: use json_object response format.
  const isGptOss = /gpt-oss/i.test(input.model);
  const isGlmOrQwen = /glm|qwen/i.test(input.model);

  const inputWords = (input.system + " " + input.prompt).split(/\s+/).length;
  const estimatedInputTokens = Math.ceil(inputWords * 1.3);
  const userTextWords = input.prompt.split(/\s+/).length;
  const estimatedContentTokens = Math.ceil(userTextWords * 1.3 * 2.5);

  // For gpt-oss with "medium" reasoning: reasoning uses ~5-10x the content tokens.
  // max_completion_tokens = reasoning + content combined on Cerebras.
  // We need: ~10x content tokens for reasoning overhead + content itself.
  // With 64K TPM, we can afford big budgets. Clamp to 16K max.
  const gptOssMaxTokens = Math.min(16384, Math.max(4096, estimatedContentTokens * 10));
  const gptOssSafe = Math.min(gptOssMaxTokens, Math.max(4096, 60000 - estimatedInputTokens));

  // For non-reasoning models: just content tokens needed
  const standardMaxTokens = Math.min(8192, Math.max(2048, estimatedContentTokens));
  const standardSafe = Math.min(standardMaxTokens, Math.max(2048, 60000 - estimatedInputTokens));

  const base = {
    model: input.model,
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.prompt }
    ],
    stream: false,
    temperature: input.temperature,
  };

  if (isGptOss) {
    return {
      ...base,
      max_completion_tokens: gptOssSafe,
      reasoning_effort: "low",
      reasoning_format: "parsed",
    };
  }

  if (isGlmOrQwen) {
    // Disable reasoning entirely — GLM/Qwen burn all tokens on thinking
    return {
      ...base,
      max_completion_tokens: standardSafe,
      reasoning_effort: "none",
    };
  }

  // Non-reasoning models: enforce JSON output
  return {
    ...base,
    max_completion_tokens: standardSafe,
    response_format: { type: "json_object" as const },
  };
}

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

  // Some Ollama models with format:"json" return content as a pre-parsed object.
  // Handle that directly before falling through to string-based parsing.
  let parsed: { finalText: string; remainingTells: string[] };
  if (typeof contentRaw === "object" && contentRaw !== null) {
    parsed = parseHumanizeObject(contentRaw as Record<string, unknown>) ?? parseHumanizeResponse(JSON.stringify(contentRaw));
  } else {
    parsed = parseHumanizeResponse(String(contentRaw));
  }

  if (!parsed.finalText) {
    throw new Error("Ollama Cloud returned empty output. The model may not have produced usable text.");
  }

  return {
    ...parsed,
    usage: pickUsage(payload),
    provider: "ollama-cloud",
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
    max_completion_tokens: (groqPayload as Record<string, unknown>).max_completion_tokens,
    temperature: input.temperature,
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
    console.error("[Groq] HTTP error:", response.status, detail.slice(0, 500));
    throw new Error(detail || `Groq request failed with ${response.status}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    usage?: Record<string, unknown>;
  };

  const rawContent = String(result.choices?.[0]?.message?.content ?? "");
  const finishReason = result.choices?.[0]?.finish_reason;
  console.log("[Groq] Response:", {
    finish_reason: finishReason,
    content_length: rawContent.length,
    content_preview: rawContent.slice(0, 200),
    usage: result.usage,
  });

  const parsed = parseHumanizeResponse(rawContent);

  if (!parsed.finalText) {
    console.error("[Groq] Parsed output is EMPTY. Raw content:", rawContent.slice(0, 500));
    throw new Error(`Groq returned empty output (finish_reason=${finishReason}, raw_len=${rawContent.length})`);
  }

  return {
    ...parsed,
    usage: result.usage ?? {},
    provider: "groq",
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
    reasoning_format: (cerebrasPayload as Record<string, unknown>).reasoning_format,
    max_completion_tokens: (cerebrasPayload as Record<string, unknown>).max_completion_tokens,
    temperature: input.temperature,
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
    console.error("[Cerebras] HTTP error:", response.status, detail.slice(0, 500));
    throw new Error(detail || `Cerebras request failed with ${response.status}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown; reasoning?: unknown }; finish_reason?: string }>;
    usage?: Record<string, unknown>;
  };

  const rawContent = String(result.choices?.[0]?.message?.content ?? "");
  const finishReason = result.choices?.[0]?.finish_reason;
  console.log("[Cerebras] Response:", {
    finish_reason: finishReason,
    content_length: rawContent.length,
    content_preview: rawContent.slice(0, 200),
    usage: result.usage,
  });

  const parsed = parseHumanizeResponse(rawContent);

  if (!parsed.finalText) {
    console.error("[Cerebras] Parsed output is EMPTY. Raw content:", rawContent.slice(0, 500));
    throw new Error(`Cerebras returned empty output (finish_reason=${finishReason}, raw_len=${rawContent.length})`);
  }

  return {
    ...parsed,
    usage: result.usage ?? {},
    provider: "cerebras",
    model: input.model
  };
}

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
  // 3-provider fallback chains based on primary provider selection
  let providerOrder: ProviderId[];
  switch (input.primaryProvider) {
    case "ollama-cloud":
      providerOrder = ["ollama-cloud", "cerebras", "groq"];
      break;
    case "cerebras":
    default:
      providerOrder = ["cerebras", "ollama-cloud", "groq"];
      break;
  }

  const fallbackErrors: string[] = [];

  for (const provider of providerOrder) {
    try {
      let result: HumanizeResult;
      if (provider === "cerebras") {
        result = await humanizeWithCerebras({
          apiKey: input.cerebrasApiKey,
          model: input.cerebrasModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature
        });
      } else if (provider === "groq") {
        result = await humanizeWithGroq({
          apiKey: input.groqApiKey,
          model: input.groqModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature
        });
      } else {
        result = await humanizeWithOllamaCloud({
          apiKey: input.ollamaApiKey,
          model: input.ollamaCloudModel,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature
        });
      }

      return { ...result, fallbackErrors };
    } catch (error) {
      fallbackErrors.push(`${provider}: ${providerErrorMessage(error)}`);
    }
  }

  throw new Error(fallbackErrors.join(" | "));
}

function pickUsage(payload: Record<string, unknown>): Record<string, unknown> {
  const usageKeys = ["total_duration", "load_duration", "prompt_eval_count", "eval_count", "eval_duration", "prompt_eval_duration"];
  return Object.fromEntries(usageKeys.filter((key) => key in payload).map((key) => [key, payload[key]]));
}
