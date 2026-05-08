import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    primaryProvider: normalizePrimaryProvider(process.env.PRIMARY_PROVIDER || "groq"),
    groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    ollamaCloudModel: process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:120b"
  });
}

function normalizePrimaryProvider(value: string): "groq" | "ollama-cloud" {
  return value === "ollama-cloud" ? "ollama-cloud" : "groq";
}