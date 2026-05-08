import { NextResponse } from "next/server";
import { ConcurrencyLimiter } from "./concurrency";
import { providerErrorMessage } from "./errors";
import { buildHumanizePrompt } from "./prompting";
import { humanizeWithFallbacks, type ProviderId } from "./providers";

export type HumanizeBody = {
  text?: unknown;
  modeId?: unknown;
  primaryProvider?: unknown;
  groqModel?: unknown;
  ollamaCloudModel?: unknown;
  temperature?: unknown;
  voiceSample?: unknown;
};

export type HumanizeHandlerDeps = {
  limiter: ConcurrencyLimiter;
  primaryProviderDefault?: string;
  groqApiKey?: string;
  ollamaApiKey?: string;
  groqModelDefault?: string;
  ollamaCloudModelDefault?: string;
  humanize?: typeof humanizeWithFallbacks;
  promptBuilder?: typeof buildHumanizePrompt;
};

export async function handleHumanizeRequest(body: HumanizeBody, deps: HumanizeHandlerDeps) {
  const text = String(body.text ?? "").trim();
  const primaryProvider = normalizePrimaryProvider(
    String(body.primaryProvider || deps.primaryProviderDefault || "groq")
  );
  const groqModel = String(body.groqModel || deps.groqModelDefault || "llama-3.1-8b-instant").trim();
  const ollamaCloudModel = String(body.ollamaCloudModel || deps.ollamaCloudModelDefault || "gpt-oss:120b").trim();

  if (!text) {
    return NextResponse.json({ error: "Paste some text before humanizing." }, { status: 400 });
  }

  const promptBuilder = deps.promptBuilder ?? buildHumanizePrompt;
  const prompt = promptBuilder({
    text,
    modeId: String(body.modeId || "standard"),
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    voiceSample: typeof body.voiceSample === "string" ? body.voiceSample : undefined
  });

  if (!deps.limiter.tryAcquire()) {
    return NextResponse.json(
      { error: "Too many humanize requests are running right now. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": "2" } }
    );
  }

  try {
    const humanize = deps.humanize ?? humanizeWithFallbacks;
    const result = await humanize({
      primaryProvider,
      groqApiKey: deps.groqApiKey || "",
      ollamaApiKey: deps.ollamaApiKey || "",
      groqModel,
      ollamaCloudModel,
      system: prompt.system,
      prompt: prompt.user,
      temperature: prompt.temperature
    });

    return NextResponse.json({
      text: result.finalText,
      remainingTells: result.remainingTells,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      fallbackErrors: result.fallbackErrors,
      mode: prompt.mode.label
    });
  } catch (error) {
    return NextResponse.json({ error: providerErrorMessage(error) }, { status: 500 });
  } finally {
    deps.limiter.release();
  }
}

function normalizePrimaryProvider(value: string): ProviderId {
  return value === "ollama-cloud" ? "ollama-cloud" : "groq";
}