import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PrimaryProvider = "cerebras" | "groq" | "ollama-cloud";

export async function GET() {
  return NextResponse.json({
    primaryProvider: normalizePrimaryProvider(process.env.PRIMARY_PROVIDER || "cerebras"),
    cerebrasModel: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    ollamaCloudModel: process.env.OLLAMA_CLOUD_MODEL || "gemma4:31b-cloud"
  });
}

function normalizePrimaryProvider(value: string): PrimaryProvider {
  const map: Record<string, PrimaryProvider> = {
    cerebras: "cerebras",
    groq: "groq",
    "ollama-cloud": "ollama-cloud",
  };
  return map[value] ?? "cerebras";
}