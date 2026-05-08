import { providerErrorMessage } from "./errors";
import { parseHumanizeResponse } from "./prompting";

export type ProviderId = "groq" | "ollama-cloud" | "ollama-local";

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
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt }
    ],
    stream: false,
    format: "json",
    think: false,
    options: {
      temperature: input.temperature
    }
  };
}

export function buildGroqPayload(input: ProviderPayloadInput) {
  return {
    model: input.model,
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.prompt }
    ],
    stream: false,
    temperature: input.temperature,
    response_format: { type: "json_object" as const }
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
  const parsed = parseHumanizeResponse(String(message?.content ?? payload.response ?? ""));

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

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildGroqPayload(input))
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Groq request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: Record<string, unknown>;
  };
  const parsed = parseHumanizeResponse(String(payload.choices?.[0]?.message?.content ?? ""));

  return {
    ...parsed,
    usage: payload.usage ?? {},
    provider: "groq",
    model: input.model
  };
}

export async function humanizeWithFallbacks(input: {
  system: string;
  prompt: string;
  temperature: number;
  primaryProvider: ProviderId;
  groqApiKey: string;
  ollamaApiKey: string;
  groqModel: string;
  ollamaCloudModel: string;
}): Promise<HumanizeResult & { fallbackErrors: string[] }> {
  const providers = input.primaryProvider === "ollama-cloud" ? ["ollama-cloud", "groq"] : ["groq", "ollama-cloud"];
  const fallbackErrors: string[] = [];

  for (const provider of providers) {
    try {
      const result =
        provider === "groq"
          ? await humanizeWithGroq({
              apiKey: input.groqApiKey,
              model: input.groqModel,
              system: input.system,
              prompt: input.prompt,
              temperature: input.temperature
            })
          : await humanizeWithOllamaCloud({
              apiKey: input.ollamaApiKey,
              model: input.ollamaCloudModel,
              system: input.system,
              prompt: input.prompt,
              temperature: input.temperature
            });

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
