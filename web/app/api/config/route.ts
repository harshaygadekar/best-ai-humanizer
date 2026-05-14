import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    primaryProvider: normalizePrimaryProvider(process.env.PRIMARY_PROVIDER || "cerebras"),
    cerebrasModel: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    ollamaCloudModel: process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:120b"
  });
}

function normalizePrimaryProvider(value: string): "cerebras" | "groq" | "ollama-cloud" {
  if (value === "ollama-cloud") return "ollama-cloud";
  if (value === "groq") return "groq";
  return "cerebras";
}