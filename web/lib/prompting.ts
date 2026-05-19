import { HUMANIZE_MODES, type HumanizeMode } from "./modes";

export type PromptInput = {
  text: string;
  modeId: string;
  temperature?: number;
  voiceSample?: string;
};

export type PromptPackage = {
  system: string;
  user: string;
  mode: HumanizeMode;
  temperature: number;
};

export function getModeById(modeId: string): HumanizeMode {
  return HUMANIZE_MODES.find((mode) => mode.id === modeId) ?? HUMANIZE_MODES[0];
}

export function buildHumanizePrompt(input: PromptInput): PromptPackage {
  const mode = getModeById(input.modeId);
  const voiceSection = input.voiceSample?.trim()
    ? `\nMatch this voice sample's rhythm and formality:\n${input.voiceSample.trim()}\n`
    : "";

  // The prompt is designed to be compact (~500 tokens) to fit within
  // Cerebras's 64K TPM and Groq's 8K TPM budgets, while still being
  // highly effective at defeating AI content detectors.
  const system = `You are a seasoned freelance editor who rewrites text to sound authentically human.

AI detectors flag text with uniform sentence length, predictable word choice, and polished-but-sterile rhythm. Defeat them:

BURSTINESS: Mix sentence lengths aggressively. A 4-word punch. Then a longer sentence that winds through an idea, maybe with a parenthetical aside, before landing. Never write two similar-length sentences back-to-back.

BANNED WORDS (never use): delve, tapestry, crucial, pivotal, landscape (abstract), moreover, furthermore, in conclusion, it's important to note, stands as, serves as, testament, underscores, highlights, fosters, garnered, showcases, intricate, comprehensive, utilize, leverage, cutting-edge, seamless, robust, endeavor, multifaceted, paramount, evolving, realm, navigate, embark, groundbreaking, in today's, leveraging, facilitating, spearheading.

RULES:
- Do a real rewrite, not light cleanup. If the output mostly mirrors the source with tiny edits, that is a failure.
- Preserve all facts, names, numbers, and claims exactly.
- Vary paragraph length — one-sentence paragraphs are fine.
- Use contractions where natural (it's, don't, can't).
- Prefer concrete verbs over abstract noun-stacks.
- Preserve formatting: headers, bullet points, line breaks, code blocks.
- Never include labels like FINAL VERSION, REMAINING TELLS, or audit notes in prose.
- After drafting, self-audit: "What still sounds AI?" Fix those.

Mode: ${mode.id} — ${mode.instruction}
${voiceSection}
Return ONLY valid JSON: {"final_text":"...","remaining_tells":["..."]}
Do not wrap in markdown fences.`.trim();

  const user = `Humanize this text. Meaning must stay intact. Use straight quotes.

${input.text.trim()}`.trim();

  return {
    system,
    user,
    mode,
    temperature: input.temperature ?? mode.temperature
  };
}

// ---------------------------------------------------------------------------
// Response parsing — multi-strategy with robust fallbacks
// ---------------------------------------------------------------------------

export function parseHumanizeResponse(rawText: string): { finalText: string; remainingTells: string[] } {
  // Strip reasoning-model think blocks (<think>...</think>) before processing.
  const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const cleaned = stripWrappers(withoutThink);

  // Strategy 1: Standard JSON.parse
  const jsonText = extractJson(cleaned);
  if (jsonText) {
    try {
      const payload = JSON.parse(jsonText) as { final_text?: unknown; remaining_tells?: unknown };
      const finalText = cleanFinalText(String(payload.final_text ?? ""));
      const remainingTells = normalizeTells(payload.remaining_tells);
      if (finalText) {
        return { finalText, remainingTells };
      }
    } catch {
      // Try repair
    }

    // Strategy 2: Attempt to repair common JSON malformations
    try {
      const repaired = repairJson(jsonText);
      const payload = JSON.parse(repaired) as { final_text?: unknown; remaining_tells?: unknown };
      const finalText = cleanFinalText(String(payload.final_text ?? ""));
      if (finalText) {
        return { finalText, remainingTells: normalizeTells(payload.remaining_tells) };
      }
    } catch {
      // Try regex
    }

    // Strategy 3: Regex extraction of final_text value
    const regexMatch = jsonText.match(/"final_text"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (regexMatch?.[1]) {
      const finalText = cleanFinalText(regexMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      if (finalText) {
        return { finalText, remainingTells: [] };
      }
    }
  }

  // Strategy 4: Strip JSON scaffold and return raw prose
  const stripped = cleaned
    .replace(/^\s*\{\s*/, "")
    .replace(/\s*\}\s*$/, "")
    .replace(/"final_text"\s*:\s*"?/gi, "")
    .replace(/"remaining_tells"\s*:\s*\[.*?\]/gis, "")
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();

  return { finalText: cleanFinalText(stripped), remainingTells: [] };
}

function repairJson(text: string): string {
  return text
    // Fix missing colons between key and value
    .replace(/"(\w+)"\s+"/g, '"$1": "')
    .replace(/"(\w+)"\s+\[/g, '"$1": [')
    // Fix trailing commas before closing brackets
    .replace(/,\s*([}\]])/g, "$1")
    // Fix single quotes to double quotes
    .replace(/'/g, '"');
}

function stripWrappers(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function cleanFinalText(text: string): string {
  const withoutWrappers = stripWrappers(text);
  const withoutLabel = withoutWrappers.replace(/^(final(?:\s+version)?|rewrite|output)\s*:?\s*/i, "");
  return withoutLabel
    .split(/\b(?:remaining\s+tells?|remaining ai tells|audit(?:\s+notes)?|what still sounds ai-generated)\b\s*:?/i)[0]
    .trim();
}

function normalizeTells(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return items
    .map((item) => String(item).trim().replace(/^-+\s*/, ""))
    .filter((item) => item && !["none", "none detected", "no remaining tells", "no obvious tells"].includes(item.toLowerCase().replace(/\.$/, "")));
}
