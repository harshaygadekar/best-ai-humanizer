/**
 * LLM Audit Validation — Tests the LLM-based detector against ground-truth
 * labeled samples to measure accuracy, bias, and edge cases.
 *
 * Usage: npx -y dotenv-cli -e .env.local -- npx tsx scripts/validate-llm-audit.ts
 */

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || "";
if (!CEREBRAS_API_KEY) {
  console.error("ERROR: Set CEREBRAS_API_KEY in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ground-truth test cases — each has a label (expected classification)
// ---------------------------------------------------------------------------

type TestCase = {
  label: string;
  expected: "ai" | "human" | "mixed";
  expectedRange: [number, number]; // acceptable ai_probability range
  text: string;
};

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // CLEARLY AI-GENERATED (should score HIGH, 70-100)
  // =========================================================================
  {
    label: "1. Classic ChatGPT output",
    expected: "ai",
    expectedRange: [60, 100],
    text: `In today's rapidly evolving digital landscape, artificial intelligence is revolutionizing the way individuals and organizations create content, enabling unprecedented levels of efficiency, scalability, and innovation across diverse communication workflows. Furthermore, these transformative technologies are reshaping the paradigm of content creation, offering unprecedented opportunities for growth and development across various sectors.`,
  },
  {
    label: "2. AI listicle pattern",
    expected: "ai",
    expectedRange: [60, 100],
    text: `Here are five key strategies to enhance your productivity in 2024. First, leverage AI-powered tools to streamline your workflow. Second, implement time-blocking techniques to maximize focus. Third, utilize data-driven insights to make informed decisions. Fourth, foster a culture of continuous learning within your team. Fifth, embrace automation to eliminate repetitive tasks and free up valuable time for strategic thinking.`,
  },
  {
    label: "3. AI with hedging phrases",
    expected: "ai",
    expectedRange: [50, 100],
    text: `It is important to note that the intersection of technology and education has created unprecedented opportunities for learners worldwide. One could argue that these developments represent a paradigm shift in how knowledge is disseminated and consumed. Furthermore, it's worth mentioning that the democratization of information has led to a more inclusive learning environment, fostering innovation and collaboration across diverse communities.`,
  },

  // =========================================================================
  // CLEARLY HUMAN-WRITTEN (should score LOW, 0-35)
  // =========================================================================
  {
    label: "4. Casual human anecdote",
    expected: "human",
    expectedRange: [0, 35],
    text: `I spent most of last Tuesday trying to fix a leaky faucet. Got two trips to Home Depot out of it and a bruised thumb. My neighbor Dave wandered over around noon and told me I was using the wrong wrench, which turned out to be true. Sometimes you just need someone who's done it before to point out the obvious thing you're missing.`,
  },
  {
    label: "5. Human journal entry",
    expected: "human",
    expectedRange: [0, 35],
    text: `Woke up at 5:30 again — couldn't sleep. Made coffee, burned the toast. The dog wanted out but it was raining so he just stood at the door looking betrayed. I read half a chapter of that mystery novel before the kids got up. Sarah has a dentist appointment at 3, which means I need to leave work early. Need to remember to grab milk.`,
  },
  {
    label: "6. Human opinion piece",
    expected: "human",
    expectedRange: [0, 40],
    text: `Look, I get why people are excited about self-driving cars. But here's what bugs me: nobody talks about what happens when the software crashes at 70 mph. We've all seen our phones freeze mid-text. My laptop blue-screened twice last week. And we want to hand over steering to the same kind of code? I'm not saying it'll never work. I'm saying maybe pump the brakes on the hype.`,
  },

  // =========================================================================
  // SHORT TEXT EDGE CASES (tricky — short samples are hard to classify)
  // =========================================================================
  {
    label: "7. Very short human text (1 sentence)",
    expected: "human",
    expectedRange: [0, 50],
    text: `My cat knocked my coffee off the desk again this morning.`,
  },
  {
    label: "8. Very short AI text (1 sentence)",
    expected: "ai",
    expectedRange: [30, 100],
    text: `Leveraging cutting-edge artificial intelligence technologies enables organizations to optimize their operational workflows and drive unprecedented value creation.`,
  },

  // =========================================================================
  // OUR HUMANIZED OUTPUT (should score MODERATE or LOW, <60 ideally)
  // =========================================================================
  {
    label: "9. Our short humanized output (sample text)",
    expected: "mixed",
    expectedRange: [20, 80],
    text: `AI is reshaping how people and companies make content. It cranks up efficiency, lets projects scale, and sparks fresh ideas across all kinds of communication pipelines (from marketing emails to internal reports).`,
  },
  {
    label: "10. Our long humanized output (programming lecture)",
    expected: "mixed",
    expectedRange: [0, 50],
    text: `"A golden rule in programming is that code doesn't do what you expect—it does exactly what you tell it to do." Bridging that gap can be a tough slog. In this lecture we'll look at two tricks for wrestling with buggy, greedy code: debugging and profiling.

Debugging

Printf Debugging and Logging
The best debugging tool is still plain old thinking, plus a few well-placed print statements.
— Brian Kernighan, Unix for Beginners.

One way to hunt down a bug is to sprinkle prints around the spot where things go wrong, then repeat until you gather enough clues. Another way is to swap ad-hoc prints for a logging system.

Logging is basically "printing with more care" and usually comes with a framework that lets you:
* send logs (or parts of them) to different destinations;
* assign severity levels like INFO, DEBUG, WARN, ERROR and filter on those;
* output structured data so you can pull out the details later.

You'll often add logging statements while you code, so the info you need is already there. And after you fix a problem with prints, it's smart to turn those prints into proper logs before you delete them. That way, if a similar bug pops up later, the diagnostic data is already in place without touching the code again.`,
  },

  // =========================================================================
  // NON-ENGLISH (edge case)
  // =========================================================================
  {
    label: "11. Spanish human-like text",
    expected: "human",
    expectedRange: [0, 50],
    text: `Ayer fui al mercado con mi abuela. Ella insistió en probar cada fruta antes de comprarla, y el vendedor ya la conoce. Terminamos comprando tres kilos de naranjas que no necesitábamos. Así es ella.`,
  },
];

// ---------------------------------------------------------------------------
// LLM Audit call (same logic as detect-providers.ts)
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

type AuditResult = {
  ai_probability: number;
  confidence: string;
  signals: string[];
};

async function runLLMAudit(text: string): Promise<AuditResult> {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [
        { role: "system", content: LLM_DETECT_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_completion_tokens: 512,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error("No JSON");
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as AuditResult;
}

// ---------------------------------------------------------------------------
// Run validation
// ---------------------------------------------------------------------------

export async function main() {
  console.log("=".repeat(80));
  console.log("LLM AUDIT VALIDATION REPORT");
  console.log("=".repeat(80));
  console.log(`Model: llama3.1-8b | Temperature: 0.1`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Tests: ${TEST_CASES.length}`);
  console.log("");

  let passed = 0;
  let failed = 0;
  const results: Array<{
    label: string;
    expected: string;
    score: number;
    range: [number, number];
    pass: boolean;
    confidence: string;
    signals: string[];
  }> = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`Testing: ${tc.label}...`);
    try {
      const result = await runLLMAudit(tc.text);
      const inRange =
        result.ai_probability >= tc.expectedRange[0] &&
        result.ai_probability <= tc.expectedRange[1];

      if (inRange) {
        passed++;
        console.log(` ✅ ${result.ai_probability}% (expected ${tc.expectedRange[0]}-${tc.expectedRange[1]}%)`);
      } else {
        failed++;
        console.log(` ❌ ${result.ai_probability}% (expected ${tc.expectedRange[0]}-${tc.expectedRange[1]}%)`);
      }

      results.push({
        label: tc.label,
        expected: tc.expected,
        score: result.ai_probability,
        range: tc.expectedRange,
        pass: inRange,
        confidence: result.confidence,
        signals: result.signals,
      });
    } catch (err) {
      failed++;
      console.log(` ⚠️ ERROR: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        label: tc.label,
        expected: tc.expected,
        score: -1,
        range: tc.expectedRange,
        pass: false,
        confidence: "error",
        signals: [],
      });
    }

    await new Promise((r) => setTimeout(r, 4000));
  }

  // Summary
  console.log("");
  console.log("=".repeat(80));
  console.log("RESULTS MATRIX");
  console.log("=".repeat(80));
  console.log("");
  console.log(
    "Test".padEnd(45) +
      "Expected".padEnd(10) +
      "Score".padEnd(8) +
      "Range".padEnd(12) +
      "Result"
  );
  console.log("-".repeat(80));

  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    const scoreStr = r.score < 0 ? "ERR" : `${r.score}%`;
    console.log(
      `${r.label.padEnd(45)}${r.expected.padEnd(10)}${scoreStr.padEnd(8)}${`${r.range[0]}-${r.range[1]}%`.padEnd(12)}${icon}`
    );
  }

  console.log("");
  console.log("=".repeat(80));
  console.log(`SCORE: ${passed}/${TEST_CASES.length} passed (${Math.round((passed / TEST_CASES.length) * 100)}%)`);
  console.log("=".repeat(80));

  // Detailed signals for failed tests
  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("");
    console.log("FAILED TEST DETAILS:");
    for (const f of failures) {
      console.log(`\n  ${f.label}`);
      console.log(`    Score: ${f.score}% (expected ${f.range[0]}-${f.range[1]}%)`);
      console.log(`    Confidence: ${f.confidence}`);
      console.log(`    Signals: ${f.signals.join("; ") || "none"}`);
    }
  }

  // Bias analysis
  console.log("");
  console.log("BIAS ANALYSIS:");
  const aiTests = results.filter((r) => r.expected === "ai" && r.score >= 0);
  const humanTests = results.filter((r) => r.expected === "human" && r.score >= 0);
  const mixedTests = results.filter((r) => r.expected === "mixed" && r.score >= 0);

  if (aiTests.length) {
    const avg = Math.round(aiTests.reduce((s, r) => s + r.score, 0) / aiTests.length);
    console.log(`  AI texts avg score:     ${avg}% (should be >60)`);
  }
  if (humanTests.length) {
    const avg = Math.round(humanTests.reduce((s, r) => s + r.score, 0) / humanTests.length);
    console.log(`  Human texts avg score:  ${avg}% (should be <30)`);
  }
  if (mixedTests.length) {
    const avg = Math.round(mixedTests.reduce((s, r) => s + r.score, 0) / mixedTests.length);
    console.log(`  Mixed texts avg score:  ${avg}% (should be 20-60)`);
  }

  // Consistency check: run test #1 three times
  console.log("");
  console.log("CONSISTENCY CHECK (same text 3x):");
  const scores: number[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const result = await runLLMAudit(TEST_CASES[0].text);
      scores.push(result.ai_probability);
      process.stdout.write(`  Run ${i + 1}: ${result.ai_probability}%`);
      console.log("");
    } catch {
      console.log(`  Run ${i + 1}: ERROR`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (scores.length >= 2) {
    const spread = Math.max(...scores) - Math.min(...scores);
    console.log(`  Spread: ${spread}% (should be <15 for good consistency)`);
  }
}

main().catch(console.error);
