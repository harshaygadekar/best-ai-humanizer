import { NextResponse } from "next/server";
import { ConcurrencyLimiter } from "../../../lib/concurrency";
import { runAllDetectors } from "../../../lib/detect-providers";

export const runtime = "nodejs";
export const maxDuration = 30;

const detectLimiter = new ConcurrencyLimiter(3);

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: unknown };
  const text = String(body.text ?? "").trim();

  if (!text) {
    return NextResponse.json(
      { error: "No text provided for detection." },
      { status: 400 }
    );
  }

  if (text.length < 100) {
    return NextResponse.json(
      { error: "Text is too short for reliable AI detection. Please provide at least 100 characters." },
      { status: 400 }
    );
  }

  if (!detectLimiter.tryAcquire()) {
    return NextResponse.json(
      { error: "Too many detection requests running. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": "5" } }
    );
  }

  try {
    const report = await runAllDetectors(text, {
      // Sapling disabled — unreliable free-tier results (see diagnose-sapling.ts)
      // saplingApiKey: process.env.SAPLING_API_KEY || undefined,
      saplingApiKey: undefined,
      gptzeroApiKey: process.env.GPTZERO_API_KEY || undefined,
      zerogptRapidApiKey: process.env.ZEROGPT_RAPIDAPI_KEY || undefined,
      copyleaksEmail: process.env.COPYLEAKS_EMAIL || undefined,
      copyleaksApiKey: process.env.COPYLEAKS_API_KEY || undefined,
      winstonApiKey: process.env.WINSTON_API_KEY || undefined,
      originalityApiKey: process.env.ORIGINALITY_API_KEY || undefined,
      cerebrasApiKey: process.env.CEREBRAS_API_KEY || undefined,
    });

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Detection failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    detectLimiter.release();
  }
}
