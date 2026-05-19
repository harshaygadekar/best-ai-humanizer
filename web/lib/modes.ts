export type HumanizeMode = {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  instruction: string;
  temperature: number;
};

export const HUMANIZE_MODES: HumanizeMode[] = [
  {
    id: "standard",
    label: "Standard",
    description: "Clean, readable human prose.",
    temperature: 0.70,
    instruction: "Rewrite into clear everyday prose. Vary sentence length dramatically — mix 3-word punches with longer 25-word sentences. Avoid polished transitions. Use occasional contractions, parenthetical asides, and direct phrasing over abstraction."
  },
  {
    id: "academic",
    label: "Academic",
    description: "Natural academic tone without stiffness.",
    temperature: 0.55,
    instruction: "Use a natural academic voice — the kind found in a well-written professor's blog, not a textbook. Keep technical terms and careful claims, but make sentence structure irregular. Mix concise observations with longer analytical sentences. Occasionally start sentences with 'But' or 'And'. Use parenthetical qualifications mid-sentence."
  },
  {
    id: "simple",
    label: "Simple",
    description: "Plain, direct, easy to read.",
    temperature: 0.60,
    instruction: "Make the text simpler and more direct. Prefer short sentences and everyday words, but still vary rhythm — a quick sentence, then a slightly longer one. Avoid repeating sentence patterns. Do not strip away important meaning."
  },
  {
    id: "informal",
    label: "Informal",
    description: "Casual but not sloppy.",
    temperature: 0.80,
    instruction: "Make it sound like you're explaining this to a friend over coffee. Use contractions naturally. Drop in the occasional rhetorical question or aside. Let some sentences be incomplete thoughts. Avoid anything that sounds like a press release."
  },
  {
    id: "formal",
    label: "Formal",
    description: "Polished professional tone.",
    temperature: 0.50,
    instruction: "Use a formal professional voice without sounding machine-written. Be concise and specific. Still vary sentence length — short declaratives mixed with compound sentences. Avoid corporate jargon stacks and hollow intensifiers."
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add natural detail without inventing facts.",
    temperature: 0.70,
    instruction: "Expand the text slightly by making implied logic explicit and adding natural transitions. Vary how you expand — sometimes a brief clarification, sometimes a whole explanatory sentence. Do not invent new facts, statistics, or claims."
  },
  {
    id: "shorten",
    label: "Shorten",
    description: "Compress while sounding human.",
    temperature: 0.60,
    instruction: "Shorten the text while preserving meaning. Cut filler, duplicated points, and generic AI phrasing. Even when compressing, keep rhythm varied — not every shortened sentence should be the same length."
  }
];

export const PRIMARY_MODE_IDS = ["standard", "academic", "simple", "informal", "formal", "expand", "shorten"];
