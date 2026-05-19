/**
 * Diagnostic script — calls Sapling AI Detect API directly with test samples
 * to verify our integration is correct and to baseline detection scores.
 *
 * Usage: npx tsx scripts/diagnose-sapling.ts
 */

const SAPLING_API_KEY = process.env.SAPLING_API_KEY || "";

if (!SAPLING_API_KEY) {
  console.error("ERROR: Set SAPLING_API_KEY in .env.local or pass it via env.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test samples
// ---------------------------------------------------------------------------

const SAMPLES = {
  // 1. Obviously AI-generated text (should score high)
  ai_generated: `In today's rapidly evolving digital landscape, artificial intelligence is revolutionizing the way individuals and organizations create content, enabling unprecedented levels of efficiency, scalability, and innovation across diverse communication workflows. Furthermore, these transformative technologies are reshaping the paradigm of content creation, offering unprecedented opportunities for growth and development across various sectors.`,

  // 2. Known human-written text (should score low)
  human_written: `I spent most of last Tuesday trying to fix a leaky faucet. Got two trips to Home Depot out of it and a bruised thumb. My neighbor Dave wandered over around noon and told me I was using the wrong wrench, which turned out to be true. Sometimes you just need someone who's done it before to point out the obvious thing you're missing.`,

  // 3. Our humanized output from the screenshot
  humanized_output: `AI is reshaping how people and companies make content. It cranks up efficiency, lets projects scale, and sparks fresh ideas across all kinds of communication pipelines (from marketing emails to internal reports).`,

  // 4. Manually rewritten version (aggressive humanization)
  manual_rewrite: `Look, AI is changing how we write stuff — that much is obvious. Companies are using it to pump out content faster, sure. But here's the thing most people miss: it's not just about speed. The real shift? People are rethinking what "good content" even means when a machine can draft something passable in ten seconds. Whether that's a net positive depends on who you ask.`,
};

// ---------------------------------------------------------------------------
// Sapling API call
// ---------------------------------------------------------------------------

async function callSapling(text: string): Promise<{
  score: number;
  sentence_scores: Array<{ score: number; sentence: string }>;
  raw: Record<string, unknown>;
}> {
  const res = await fetch("https://api.sapling.ai/api/v1/aidetect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: SAPLING_API_KEY, text, sent_scores: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sapling HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    score: typeof data.score === "number" ? data.score : -1,
    sentence_scores: (data.sentence_scores as Array<{ score: number; sentence: string }>) || [],
    raw: data,
  };
}

// ---------------------------------------------------------------------------
// Run diagnostics
// ---------------------------------------------------------------------------

async function main() {
  console.log("=" .repeat(80));
  console.log("SAPLING AI DETECT — DIAGNOSTIC REPORT");
  console.log("=" .repeat(80));
  console.log(`API Key: ${SAPLING_API_KEY.slice(0, 8)}...${SAPLING_API_KEY.slice(-4)}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("");

  const results: Array<{ label: string; score: number; pct: string }> = [];

  for (const [label, text] of Object.entries(SAMPLES)) {
    console.log("-".repeat(80));
    console.log(`TEST: ${label}`);
    console.log(`Text (${text.length} chars, ~${text.split(/\s+/).length} words):`);
    console.log(`  "${text.slice(0, 150)}..."`);
    console.log("");

    try {
      const result = await callSapling(text);

      const pct = `${(result.score * 100).toFixed(1)}%`;
      const verdict = result.score >= 0.5 ? "🔴 AI-GENERATED" : "🟢 HUMAN";
      console.log(`OVERALL SCORE: ${pct} → ${verdict}`);
      console.log(`RAW SCORE VALUE: ${result.score}`);
      console.log("");

      if (result.sentence_scores.length > 0) {
        console.log("SENTENCE BREAKDOWN:");
        for (const s of result.sentence_scores) {
          const sentVerdict = s.score >= 0.5 ? "🔴 AI" : "🟢 HUMAN";
          console.log(`  ${sentVerdict} ${(s.score * 100).toFixed(1)}% → "${s.sentence.slice(0, 100)}${s.sentence.length > 100 ? "..." : ""}"`);
        }
      }

      results.push({ label, score: result.score, pct });
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ label, score: -1, pct: "ERROR" });
    }

    console.log("");
    // Rate limit protection
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Summary table
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log("");
  console.log("Sample                    | Score    | Verdict");
  console.log("--------------------------|----------|--------");
  for (const r of results) {
    const label = r.label.padEnd(26);
    const pct = r.pct.padEnd(10);
    const verdict = r.score < 0 ? "ERROR" : r.score >= 0.5 ? "AI-GENERATED" : "HUMAN";
    console.log(`${label}| ${pct}| ${verdict}`);
  }

  console.log("");
  console.log("INTERPRETATION:");
  const humanScore = results.find((r) => r.label === "human_written");
  const humanizedScore = results.find((r) => r.label === "humanized_output");
  const aiScore = results.find((r) => r.label === "ai_generated");
  const manualScore = results.find((r) => r.label === "manual_rewrite");

  if (humanScore && humanScore.score >= 0) {
    if (humanScore.score >= 0.5) {
      console.log("⚠️  WARNING: Sapling flagged known human text as AI! This suggests the API may");
      console.log("   be unreliable for short text or our API key may have issues.");
    } else {
      console.log("✅ Sapling correctly identified human text as human.");
    }
  }

  if (humanizedScore && humanizedScore.score >= 0) {
    if (humanizedScore.score >= 0.8) {
      console.log("⚠️  Our humanized output scored very high. The humanization is NOT effective");
      console.log("   enough to fool Sapling. Need more aggressive rewriting.");
    } else if (humanizedScore.score >= 0.5) {
      console.log("🟡 Our humanized output scored moderate. Some improvement needed.");
    } else {
      console.log("✅ Our humanized output passed! Sapling considers it human.");
    }
  }

  if (manualScore && humanizedScore && manualScore.score >= 0 && humanizedScore.score >= 0) {
    const improvement = humanizedScore.score - manualScore.score;
    if (improvement > 0.1) {
      console.log(`📊 The manual rewrite scores ${(improvement * 100).toFixed(0)}% LOWER than our AI rewrite.`);
      console.log("   This confirms our system prompt needs more aggressive humanization techniques.");
    }
  }
}

main().catch(console.error);
