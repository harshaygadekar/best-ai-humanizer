import { NextResponse } from "next/server";
import { providerErrorMessage } from "../../../lib/errors";
import { buildHumanizePrompt } from "../../../lib/prompting";
import { humanizeWithFallbacks, type ProviderId } from "../../../lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

type HumanizeBody = {
  text?: unknown;
  modeId?: unknown;
  primaryProvider?: unknown;
  groqModel?: unknown;
  ollamaCloudModel?: unknown;
  temperature?: unknown;
  voiceSample?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HumanizeBody;
    const text = String(body.text ?? "").trim();
    const primaryProvider = normalizePrimaryProvider(String(body.primaryProvider || process.env.PRIMARY_PROVIDER || "groq"));
    const groqModel = String(body.groqModel || process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
    const ollamaCloudModel = String(body.ollamaCloudModel || process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:120b").trim();

    if (!text) {
      return NextResponse.json({ error: "Paste some text before humanizing." }, { status: 400 });
    }

    const prompt = buildHumanizePrompt({
      text,
      modeId: String(body.modeId || "standard"),
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      voiceSample: typeof body.voiceSample === "string" ? body.voiceSample : undefined
    });

    const result = await humanizeWithFallbacks({
      primaryProvider,
      groqApiKey: process.env.GROQ_API_KEY || "",
      ollamaApiKey: process.env.OLLAMA_API_KEY || "",
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
  }
}

function normalizePrimaryProvider(value: string): ProviderId {
  return value === "ollama-cloud" ? "ollama-cloud" : "groq";
}
