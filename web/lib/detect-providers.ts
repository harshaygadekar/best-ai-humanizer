// ---------------------------------------------------------------------------
// AI Content Detection — Multi-Provider Engine
// ---------------------------------------------------------------------------
// Each provider adapter normalises its output into a DetectorResult.
// `runAllDetectors` fires every *configured* provider in parallel and returns
// an aggregated DetectionReport.
// ---------------------------------------------------------------------------

export type DetectorId =
  | "sapling"
  | "gptzero"
  | "zerogpt"
  | "copyleaks"
  | "winston"
  | "originality";

export type DetectorStatus = "pass" | "fail" | "error" | "skipped";

export type DetectorResult = {
  id: DetectorId;
  name: string;
  status: DetectorStatus;
  aiScore: number;   // 0–100
  humanScore: number; // 0–100
  error?: string;
};

export type DetectionReport = {
  overallAiPercent: number;
  verdict: string;
  flaggedCount: number;
  totalChecked: number;
  detectors: DetectorResult[];
};

// ---------------------------------------------------------------------------
// Provider configuration read from env
// ---------------------------------------------------------------------------

export type DetectorEnvKeys = {
  saplingApiKey?: string;
  gptzeroApiKey?: string;
  zerogptRapidApiKey?: string;
  copyleaksEmail?: string;
  copyleaksApiKey?: string;
  winstonApiKey?: string;
  originalityApiKey?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function skipped(id: DetectorId, name: string): DetectorResult {
  return { id, name, status: "skipped", aiScore: 0, humanScore: 0 };
}

function errored(id: DetectorId, name: string, message: string): DetectorResult {
  return { id, name, status: "error", aiScore: 0, humanScore: 0, error: message };
}

function scored(id: DetectorId, name: string, aiPercent: number): DetectorResult {
  const clamped = Math.max(0, Math.min(100, Math.round(aiPercent)));
  return {
    id,
    name,
    status: clamped >= 50 ? "fail" : "pass",
    aiScore: clamped,
    humanScore: 100 - clamped,
  };
}

// ---------------------------------------------------------------------------
// Individual provider adapters
// ---------------------------------------------------------------------------

async function detectSapling(text: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "sapling";
  const name = "Sapling.ai";
  try {
    const res = await fetchWithTimeout("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey, text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { score?: number };
    const score = typeof data.score === "number" ? data.score * 100 : 0;
    return scored(id, name, score);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

async function detectGPTZero(text: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "gptzero";
  const name = "GPTZero";
  try {
    const res = await fetchWithTimeout("https://api.gptzero.me/v2/predict/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ document: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      documents?: Array<{
        class_probabilities?: { ai?: number; human?: number; mixed?: number };
        completely_generated_prob?: number;
      }>;
    };
    const doc = data.documents?.[0];
    const aiProb = doc?.class_probabilities?.ai ?? doc?.completely_generated_prob ?? 0;
    return scored(id, name, aiProb * 100);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

async function detectZeroGPT(text: string, rapidApiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "zerogpt";
  const name = "ZeroGPT";
  try {
    const res = await fetchWithTimeout("https://zerogpt.p.rapidapi.com/api/v1/detectText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "zerogpt.p.rapidapi.com",
      },
      body: JSON.stringify({ input_text: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      success?: boolean;
      data?: { is_gpt_generated?: number };
    };
    const score = data.data?.is_gpt_generated ?? 0;
    return scored(id, name, score);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

async function detectCopyleaks(text: string, email: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "copyleaks";
  const name = "Copyleaks";
  try {
    // Step 1: Login to get access token
    const loginRes = await fetchWithTimeout("https://id.copyleaks.com/v3/account/login/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, key: apiKey }),
    });
    if (!loginRes.ok) throw new Error(`Login failed: HTTP ${loginRes.status}`);
    const loginData = (await loginRes.json()) as { access_token?: string };
    const token = loginData.access_token;
    if (!token) throw new Error("No access token returned");

    // Step 2: Submit text for AI detection
    const scanId = `detect-${Date.now()}`;
    const detectRes = await fetchWithTimeout(
      `https://api.copyleaks.com/v2/writer-detector/${scanId}/check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, sandbox: false }),
      }
    );
    if (!detectRes.ok) throw new Error(`Detection failed: HTTP ${detectRes.status}`);
    const detectData = (await detectRes.json()) as {
      summary?: { ai?: number; human?: number };
    };
    const aiScore = (detectData.summary?.ai ?? 0) * 100;
    return scored(id, name, aiScore);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

async function detectWinston(text: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "winston";
  const name = "Winston AI";
  try {
    const res = await fetchWithTimeout("https://api.gowinston.ai/v2/ai-content-detection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ text, version: "latest", sentences: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { score?: number };
    // Winston returns a "human" score (0-100), so AI = 100 - human
    const humanScore = typeof data.score === "number" ? data.score : 50;
    return scored(id, name, 100 - humanScore);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

async function detectOriginality(text: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "originality";
  const name = "Originality.ai";
  try {
    const res = await fetchWithTimeout("https://api.originality.ai/api/v1/scan/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OAI-API-KEY": apiKey,
      },
      body: JSON.stringify({ content: text, title: "AI Humanizer Check" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      score?: { ai?: number; original?: number };
    };
    const aiScore = (data.score?.ai ?? 0) * 100;
    return scored(id, name, aiScore);
  } catch (err) {
    return errored(id, name, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runAllDetectors(
  text: string,
  env: DetectorEnvKeys
): Promise<DetectionReport> {
  const tasks: Promise<DetectorResult>[] = [
    env.saplingApiKey
      ? detectSapling(text, env.saplingApiKey)
      : Promise.resolve(skipped("sapling", "Sapling.ai")),

    env.gptzeroApiKey
      ? detectGPTZero(text, env.gptzeroApiKey)
      : Promise.resolve(skipped("gptzero", "GPTZero")),

    env.zerogptRapidApiKey
      ? detectZeroGPT(text, env.zerogptRapidApiKey)
      : Promise.resolve(skipped("zerogpt", "ZeroGPT")),

    env.copyleaksEmail && env.copyleaksApiKey
      ? detectCopyleaks(text, env.copyleaksEmail, env.copyleaksApiKey)
      : Promise.resolve(skipped("copyleaks", "Copyleaks")),

    env.winstonApiKey
      ? detectWinston(text, env.winstonApiKey)
      : Promise.resolve(skipped("winston", "Winston AI")),

    env.originalityApiKey
      ? detectOriginality(text, env.originalityApiKey)
      : Promise.resolve(skipped("originality", "Originality.ai")),
  ];

  const settled = await Promise.allSettled(tasks);

  const detectors: DetectorResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    // Should not normally happen since each adapter catches internally
    const names = ["Sapling.ai", "GPTZero", "ZeroGPT", "Copyleaks", "Winston AI", "Originality.ai"];
    const ids: DetectorId[] = ["sapling", "gptzero", "zerogpt", "copyleaks", "winston", "originality"];
    return errored(ids[i], names[i], "Unexpected failure");
  });

  const successful = detectors.filter((d) => d.status === "pass" || d.status === "fail");
  const totalChecked = successful.length;
  const flaggedCount = successful.filter((d) => d.status === "fail").length;
  const overallAiPercent =
    totalChecked > 0
      ? Math.round(successful.reduce((sum, d) => sum + d.aiScore, 0) / totalChecked)
      : 0;

  let verdict: string;
  if (totalChecked === 0) {
    verdict = "No detectors available";
  } else if (overallAiPercent < 30) {
    verdict = "Mostly human-written";
  } else if (overallAiPercent <= 70) {
    verdict = "Mixed content detected";
  } else {
    verdict = "Mostly AI-generated";
  }

  return {
    overallAiPercent,
    verdict,
    flaggedCount,
    totalChecked,
    detectors,
  };
}
