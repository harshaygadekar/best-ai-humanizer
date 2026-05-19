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
  | "originality"
  | "llm-audit";

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
  reliabilityWarning?: string;
  controlScore?: number;
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
  cerebrasApiKey?: string;
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
    console.log(`[Sapling] Sending request — text length: ${text.length} chars, ~${text.split(/\s+/).length} words`);
    console.log(`[Sapling] Text preview: "${text.slice(0, 200)}..."`);

    const res = await fetchWithTimeout("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey, text, sent_scores: true }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.log(`[Sapling] HTTP ERROR ${res.status}: ${errorBody.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      score?: number;
      sentence_scores?: Array<{ score: number; sentence: string }>;
      text?: string;
    };

    // Log the full raw response
    console.log(`[Sapling] RAW RESPONSE:`, JSON.stringify({
      score: data.score,
      sentence_count: data.sentence_scores?.length ?? 0,
    }));

    // Log per-sentence breakdown so we can see which sentences are flagged
    if (data.sentence_scores?.length) {
      console.log(`[Sapling] SENTENCE-LEVEL BREAKDOWN:`);
      for (const s of data.sentence_scores) {
        const label = s.score >= 0.5 ? "🔴 AI" : "🟢 HUMAN";
        console.log(`  ${label} (${(s.score * 100).toFixed(1)}%) → "${s.sentence.slice(0, 120)}"`);
      }
    }

    const score = typeof data.score === "number" ? data.score * 100 : 0;
    console.log(`[Sapling] FINAL SCORE: ${score.toFixed(1)}% AI (raw: ${data.score})`);

    return scored(id, name, score);
  } catch (err) {
    console.log(`[Sapling] EXCEPTION:`, err instanceof Error ? err.message : String(err));
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
// LLM-based AI detection (FREE — uses existing Cerebras API key)
// ---------------------------------------------------------------------------

const LLM_DETECT_PROMPT = `You are an AI content detection expert. Analyze the following text and determine the probability it was written by AI.

Evaluate these specific signals:
1. PERPLEXITY: Are word choices predictable/formulaic or creative/surprising?
2. BURSTINESS: Does sentence length vary naturally (mix of short and long) or is it uniform?
3. VOCABULARY: Does it use AI-signature words (delve, tapestry, crucial, landscape, furthermore, moreover, underscores, fosters, showcases, leveraging, facilitating, multifaceted, paramount, endeavor)?
4. STRUCTURE: Are paragraphs similarly sized? Do sentences follow repetitive patterns?
5. HEDGING: Excessive "It is important to note", "It's worth mentioning", "One could argue" type phrases?
6. CADENCE: Does it have a rhythmic, polished-but-sterile flow typical of LLMs?

Return ONLY valid JSON:
{"ai_probability": <number 0-100>, "confidence": "low"|"medium"|"high", "signals": ["<brief signal found>", ...]}

Do not wrap in markdown fences. Do not add explanation outside the JSON.`;

async function detectWithLLM(text: string, apiKey: string): Promise<DetectorResult> {
  const id: DetectorId = "llm-audit";
  const name = "LLM Audit";
  try {
    console.log(`[LLM Audit] Analyzing text — ${text.length} chars, ~${text.split(/\s+/).length} words`);

    const res = await fetchWithTimeout(
      "https://api.cerebras.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [
            { role: "system", content: LLM_DETECT_PROMPT },
            { role: "user", content: text },
          ],
          temperature: 0.1,
          max_completion_tokens: 512,
        }),
      },
      15000
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[LLM Audit] HTTP ERROR ${res.status}: ${body.slice(0, 300)}`);
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    console.log(`[LLM Audit] RAW RESPONSE: ${raw.slice(0, 500)}`);

    // Parse JSON from the response
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error("No valid JSON in LLM response");
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      ai_probability?: number;
      confidence?: string;
      signals?: string[];
    };

    const aiPct = typeof parsed.ai_probability === "number" ? parsed.ai_probability : 50;
    console.log(`[LLM Audit] RESULT: ${aiPct}% AI (confidence: ${parsed.confidence || "unknown"})`);
    if (parsed.signals?.length) {
      console.log(`[LLM Audit] SIGNALS: ${parsed.signals.join("; ")}`);
    }

    return scored(id, name, aiPct);
  } catch (err) {
    console.log(`[LLM Audit] EXCEPTION:`, err instanceof Error ? err.message : String(err));
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

    // LLM-based detection — FREE, uses existing Cerebras API key
    env.cerebrasApiKey
      ? detectWithLLM(text, env.cerebrasApiKey)
      : Promise.resolve(skipped("llm-audit", "LLM Audit")),
  ];

  // Run a control check — send known human text through Sapling to detect
  // unreliable API keys/configurations. If even this scores high, Sapling
  // is not giving us trustworthy results.
  const CONTROL_TEXT = "I burned dinner last night because I got distracted reading about volcanoes. My daughter thought it was hilarious. She kept asking if the pasta was made with real lava. We ended up ordering pizza and she told the delivery guy the whole story.";
  const controlTask = env.saplingApiKey
    ? detectSapling(CONTROL_TEXT, env.saplingApiKey)
    : null;

  const settled = await Promise.allSettled(tasks);

  const detectors: DetectorResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    const names = ["Sapling.ai", "GPTZero", "ZeroGPT", "Copyleaks", "Winston AI", "Originality.ai", "LLM Audit"];
    const ids: DetectorId[] = ["sapling", "gptzero", "zerogpt", "copyleaks", "winston", "originality", "llm-audit"];
    return errored(ids[i], names[i], "Unexpected failure");
  });

  // Check control result for reliability
  let controlScore: number | null = null;
  let reliabilityWarning: string | undefined;
  if (controlTask) {
    try {
      const controlResult = await controlTask;
      controlScore = controlResult.aiScore;
      console.log(`[Control Check] Known-human text scored ${controlScore}% AI on Sapling`);
      if (controlScore > 70) {
        reliabilityWarning = `⚠️ Sapling may be unreliable — it scored known human text at ${controlScore}% AI. Scores shown may be inflated.`;
        console.log(`[Control Check] WARNING: ${reliabilityWarning}`);
      }
    } catch {
      console.log("[Control Check] Control text check failed, skipping reliability check.");
    }
  }

  // When Sapling failed the control check, exclude it from the scoring average
  // so it doesn't pollute the overall % with its inflated numbers.
  const scoringPool = reliabilityWarning
    ? detectors.filter((d) => (d.status === "pass" || d.status === "fail") && d.id !== "sapling")
    : detectors.filter((d) => d.status === "pass" || d.status === "fail");

  const successful = detectors.filter((d) => d.status === "pass" || d.status === "fail");
  const erroredDetectors = detectors.filter((d) => d.status === "error");
  const skippedDetectors = detectors.filter((d) => d.status === "skipped");
  const totalChecked = successful.length;
  const flaggedCount = successful.filter((d) => d.status === "fail").length;

  // Use the filtered scoring pool for the overall % so unreliable detectors
  // don't skew the average
  const overallAiPercent =
    scoringPool.length > 0
      ? Math.round(scoringPool.reduce((sum, d) => sum + d.aiScore, 0) / scoringPool.length)
      : 0;

  let verdict: string;
  if (totalChecked === 0 && erroredDetectors.length > 0) {
    const errorMsgs = erroredDetectors
      .map((d) => `${d.name}: ${d.error || "unknown error"}`)
      .join("; ");
    verdict = `All detectors encountered errors — ${errorMsgs}`;
  } else if (totalChecked === 0 && skippedDetectors.length === detectors.length) {
    verdict = "No detectors configured";
  } else if (totalChecked === 0) {
    verdict = "No detectors available";
  } else if (reliabilityWarning) {
    // If the control check failed, override the verdict with a reliability warning
    verdict = overallAiPercent < 30
      ? "Mostly human-written (detector may be unreliable)"
      : overallAiPercent <= 70
        ? "Mixed content (detector may be unreliable)"
        : "Flagged as AI (but detector may be unreliable — control check failed)";
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
    ...(reliabilityWarning ? { reliabilityWarning } : {}),
    ...(controlScore !== null ? { controlScore } : {}),
  };
}
