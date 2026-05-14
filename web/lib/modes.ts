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
    temperature: 0.78,
    instruction: "Rewrite into clear everyday prose that reads like a real person typed it out. Use contractions, occasional sentence fragments, and natural asides. Mix very short punchy sentences (3-6 words) with longer ones (20-35 words) to create irregular rhythm. Avoid robotic transitions ('Furthermore', 'Moreover', 'Additionally'). Instead use natural connectors ('though', 'plus', 'that said', 'the thing is'). Remove inflated wording and synthetic polish while preserving all facts and claims."
  },
  {
    id: "academic",
    label: "Academic",
    description: "Natural academic tone without stiffness.",
    temperature: 0.55,
    instruction: "Use a natural academic voice — the kind you'd find in a well-written blog by a Ivy league professor not a textbook. Keep technical terms and careful claims, but make sentence structure irregular. Vary between concise observations and longer analytical sentences. Use parenthetical qualifications mid-sentence. Avoid ceremonial phrasing ('It is important to note', 'It should be noted'), padded transitions, and overconfident generalizations. Occasionally start a sentence with 'But' or 'And'."
  },
  {
    id: "simple",
    label: "Simple",
    description: "Plain, direct, easy to read.",
    temperature: 0.6,
    instruction: "Make the text simpler and more direct, like someone explaining it to a friend. Use short sentences but vary the length — some just 3-4 words, others up to 20. Prefer concrete verbs and everyday wording. Use contractions freely. Drop unnecessary qualifiers. Do not remove important meaning. Throw in the occasional 'basically' or 'pretty much' where natural."
  },

  {
    id: "informal",
    label: "Informal",
    description: "Casual but not sloppy.",
    temperature: 0.85,
    instruction: "Make this sound conversational — like a knowledgeable person explaining something over coffee. Use contractions everywhere they'd naturally appear. Throw in casual connectors ('honestly', 'look', 'here's the thing', 'so basically'). Use sentence fragments where they feel natural. Keep it professional enough to share but relaxed enough to feel unscripted. Avoid any phrasing that sounds like a press release or textbook."
  },
  {
    id: "formal",
    label: "Formal",
    description: "Polished professional tone.",
    temperature: 0.5,
    instruction: "Use a formal professional voice that still sounds written by a human, not generated. The key: formal human writing still has personality — occasional dashes, varied clause structure, and precise word choices that feel deliberate rather than algorithmically selected. Avoid the 'corporate AI' cadence of evenly spaced medium-length sentences. Mix concise declarations with more layered compound sentences."
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add natural detail without inventing facts.",
    temperature: 0.7,
    instruction: "Expand the text by making implied logic explicit and adding natural connective tissue between ideas. Use the kind of detail a human would add — a quick aside, a clarifying example, a restatement in different words. Do not add new facts, statistics, sources, or claims. Make the expansion feel like someone talking through the idea more thoroughly, not like AI padding."
  },
  {
    id: "shorten",
    label: "Shorten",
    description: "Compress while sounding human.",
    temperature: 0.6,
    instruction: "Shorten the text while keeping it natural. Cut filler, duplicated points, throat-clearing, and generic AI phrasing. A human shortening text doesn't produce perfect evenly-trimmed paragraphs — they cut aggressively in some spots and leave other parts mostly intact. Preserve the most important points and use direct, punchy phrasing."
  }
];

export const PRIMARY_MODE_IDS = ["standard", "academic", "simple", "informal", "formal", "expand", "shorten"];
