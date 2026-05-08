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
    ? `\nVoice matching reference:\nUse this sample to match rhythm, punctuation habits, paragraph shape, and formality.\n--- VOICE SAMPLE START ---\n${input.voiceSample.trim()}\n--- VOICE SAMPLE END ---\n`
    : "";

  const system = `
You are an expert rewrite editor for AI-assisted text humanization.

Goal:
- Rewrite text so it sounds like a real person wrote it.
- Heavy humanization is required, but the original meaning and factual claims must stay intact.
- Make the writing sound lived-in, specific, and natural rather than polished into generic "good prose."

Mode: ${mode.id} (${mode.label})
Mode instruction:
- ${mode.instruction}

Core rules:
- Do a real rewrite, not light cleanup. If the output mostly mirrors the source with tiny edits, that is a failure.
- Remove inflated significance, fake grandeur, vague authority, tutorial signposting, filler, and overexplained transitions.
- Prefer direct verbs, natural sentence openings, and concrete wording over compressed noun stacks.
- Break overly tidy cadence. Vary sentence length and paragraph shape.
- Cut em-dash overuse, rule-of-three phrasing, repetitive synonyms, hedging clusters, and canned AI vocabulary.
- Keep named entities, pipeline names, counts, and claims unless the source itself is unclear.
- Do not add citations, studies, names, numbers, or facts that were not present in the source.
- Never include labels like FINAL VERSION, REMAINING TELLS, NOTES, or audit commentary in the final prose.

Reference digest:
${REFERENCE_DIGEST}
${voiceSection}
Process:
1. Draft a substantially more human version.
2. Audit it privately for anything that still sounds synthetic.
3. Revise once more.
4. Return only valid JSON with this exact shape:
   {"final_text":"...","remaining_tells":["..."]}
5. Do not wrap the JSON in markdown fences.
`.trim();

  const user = `
Humanize the following text.

Constraints:
- Meaning must stay intact.
- Default mode is heavy but faithful rewriting.
- If the source is informal, keep it informal.
- If the source is structured, keep it readable but less robotic.
- Use straight quotes.
- If the source is short, do not be timid. Humanize it enough that the sentence structure clearly changes.
- If the source sounds like a product blurb or abstract, make it sound more like a person explaining the same thing.

Source text:
--- SOURCE START ---
${input.text.trim()}
--- SOURCE END ---
`.trim();

  return {
    system,
    user,
    mode,
    temperature: input.temperature ?? mode.temperature
  };
}

export function parseHumanizeResponse(rawText: string): { finalText: string; remainingTells: string[] } {
  const cleaned = stripWrappers(rawText);
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
      // Fall through to plain-text cleanup.
    }
  }

  return { finalText: cleanFinalText(cleaned), remainingTells: [] };
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
