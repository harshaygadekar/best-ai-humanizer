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

const REFERENCE_DIGEST =
  "Remove common AI tells: inflated significance, fake grandeur, vague authority, tutorial signposting, formulaic three-part cadence, excessive em dashes, generic transitions, noun-stack compression, overformal hedging, bold/list theatrics, and cheerful generic endings.";

export function getModeById(modeId: string): HumanizeMode {
  return HUMANIZE_MODES.find((mode) => mode.id === modeId) ?? HUMANIZE_MODES[0];
}

export function buildHumanizePrompt(input: PromptInput): PromptPackage {
  const mode = getModeById(input.modeId);
  const voiceSection = input.voiceSample?.trim()
    ? `\nHere's a sample of how I normally write — match this voice:\n${input.voiceSample.trim()}\n`
    : "";

  const system = `
You are a human writer. You've been writing professionally for 15 years. You write the way you talk: directly, with personality, and without filler. You find corporate jargon embarrassing. Your job is to rewrite the draft below in your own voice, as if you wrote it from scratch after reading the source material.

Voice: ${mode.instruction}

POSITIVE DIRECTIVES — How you write:

Conversational tone and simple language
- Write at a 7th-grade reading level. Use common, concrete words. "Show" not "demonstrate." "Help" not "facilitate." "Use" not "utilize." "Big" not "significant."
- Use contractions naturally: it's, don't, won't, they're, can't, here's, you'll, we're.

Active voice and direct verbs
- Use active voice 90% of the time. Rewrite any passive constructions.

Sentence rhythm
- Craft sentences that average 10-20 words. Some short and punchy. Others longer because you're working through an idea.
- Never write three sentences of similar length in a row.
- Use rhetorical fragments to break things up. "The good news? It works." / "Why? Simple."

Plain connectors
- Build flow with: and, but, so, then, though, still, or just start fresh. Nobody says "Moreover" or "Furthermore" out loud.

Concrete over abstract
- Prefer numbers, dates, names, and measurable facts over vague claims.

Paragraph variation
- Keep the original's paragraph breaks and headers. But your paragraphs aren't all the same size — some are one sentence, others are four or five.

NEGATIVE DIRECTIVES — What you never do:

Punctuation you avoid
- Never use semicolons (;).
- Don't use em dashes or en dashes for parenthetical asides.
- Don't use ellipses (...) for dramatic pause.
- Stick to periods, commas, question marks, and the occasional colon for lists.

Words and phrases you'd never write
- Overly formal: elucidate, exemplify, underscore, paramount, salient, integral, dichotomy, juxtaposition, thereby, forthwith, notwithstanding, heretofore
- Corporate jargon: paradigm shift, game-changing, leverage, utilize, optimize, streamline, ecosystem, stakeholder, granular, pivot, amplify, unlock, harness, revolutionize, skyrocket, master
- AI filler: delve, tapestry, pivotal, crucial, robust, cutting-edge, groundbreaking, comprehensive, multifaceted, holistic, synergy, plethora, myriad, encompasses, foster, empower, navigate, landscape, realm
- Dead phrases: in today's world, it is important to note, a testament to, pave the way, that being said, in conclusion, it is worth noting, shed light, at the end of the day

Structural habits you avoid
- Never open with "In today's..." or any grand scene-setting. Just get into it.
- Never repeat the same point in different words. Say it once.
- Never wrap up by restating what you just said. Just stop when you're done.
- Don't use numbered lists that simply restate the main points.

Facts
- Keep every fact, name, number, and claim from the original exactly. Don't make things up.
${voiceSection}
Output: Return ONLY this JSON, nothing else:
{"final_text":"your rewritten text here","remaining_tells":["phrases you couldn't fully fix"]}
`.trim();

  const user = `
Rewrite this in your own words. Keep the meaning and structure but make it sound like you actually wrote it. Use a conversational tone and simple language.

${input.text.trim()}
`.trim();

  // gpt-oss models return empty content below ~0.65 temperature
  const baseTemp = input.temperature ?? mode.temperature;
  const temperature = Math.max(baseTemp, 0.65);

  return {
    system,
    user,
    mode,
    temperature
  };
}

export function parseHumanizeResponse(rawText: string): { finalText: string; remainingTells: string[] } {
  // Strip reasoning-model think blocks (<think>...</think>) before any processing.
  // Groq and Ollama reasoning models emit these before the actual JSON output.
  const withoutThinking = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const cleaned = stripWrappers(withoutThinking);

  // --- Strategy 1: Try standard JSON.parse on the extracted JSON block ---
  const result = tryParseJson(cleaned);
  if (result) return result;

  // --- Strategy 2: Try fixing common JSON issues (missing colons, trailing commas, etc.) ---
  const jsonText = extractJson(cleaned);
  if (jsonText) {
    const fixedJson = repairJson(jsonText);
    const fixedResult = tryParseJson(fixedJson);
    if (fixedResult) return fixedResult;
  }

  // --- Strategy 3: Regex extraction of "final_text" value from raw text ---
  const regexResult = extractFinalTextByRegex(cleaned);
  if (regexResult) return regexResult;

  // --- Fallback: return the cleaned text stripped of any JSON scaffolding ---
  return { finalText: stripJsonScaffolding(cleaned), remainingTells: [] };
}

/** Attempt to handle pre-parsed objects (Ollama with format:"json" can return content as an object). */
export function parseHumanizeObject(contentObj: Record<string, unknown>): { finalText: string; remainingTells: string[] } | null {
  const finalText = cleanFinalText(String(contentObj.final_text ?? contentObj.finalText ?? ""));
  if (finalText) {
    const remainingTells = normalizeTells(contentObj.remaining_tells ?? contentObj.remainingTells);
    return { finalText, remainingTells };
  }
  return null;
}

function tryParseJson(text: string): { finalText: string; remainingTells: string[] } | null {
  const jsonText = extractJson(text);
  if (!jsonText) return null;
  try {
    const payload = JSON.parse(jsonText) as { final_text?: unknown; remaining_tells?: unknown };
    const finalText = cleanFinalText(String(payload.final_text ?? ""));
    const remainingTells = normalizeTells(payload.remaining_tells);
    if (finalText) {
      return { finalText, remainingTells };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/** Fix common JSON malformations from LLMs. */
function repairJson(jsonStr: string): string {
  let fixed = jsonStr;

  // Fix: "key" "value" → "key": "value" (missing colon between key and value)
  fixed = fixed.replace(/"(\w+)"\s+"(?![:,\]}])/g, '"$1": "');

  // Fix: "key" [...] → "key": [...] (missing colon before array)
  fixed = fixed.replace(/"(\w+)"\s+\[/g, '"$1": [');

  // Fix: "key" {...} → "key": {...} (missing colon before object)
  fixed = fixed.replace(/"(\w+)"\s+\{/g, '"$1": {');

  // Fix trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, "$1");

  return fixed;
}

/** Extract the final_text value using regex when JSON.parse fails. */
function extractFinalTextByRegex(text: string): { finalText: string; remainingTells: string[] } | null {
  // Match "final_text" followed by optional colon, then a quoted string value.
  // The string value handles escaped characters inside.
  const match = text.match(/"final_text"\s*:?\s*"((?:[^"\\]|\\.)*)"/);
  if (match?.[1]) {
    // Unescape the JSON string escapes
    let finalText: string;
    try {
      finalText = JSON.parse(`"${match[1]}"`);
    } catch {
      finalText = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    finalText = cleanFinalText(finalText);
    if (finalText) {
      return { finalText, remainingTells: [] };
    }
  }
  return null;
}

/** Remove JSON structural characters when all parsing fails, leaving just the prose. */
function stripJsonScaffolding(text: string): string {
  return cleanFinalText(
    text
      // Remove "final_text": / "remaining_tells": keys and their formatting
      .replace(/"(?:final_text|remaining_tells|remainingTells)"\s*:?\s*/g, "")
      // Remove JSON structural characters at the boundaries
      .replace(/^\s*\{/, "")
      .replace(/\}\s*$/, "")
      // Remove stray brackets
      .replace(/\[\s*\]\s*$/, "")
      // Remove leading/trailing quotes left over
      .replace(/^"+|"+$/g, "")
      .trim()
  );
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
