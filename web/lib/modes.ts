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
    temperature: 0.2,
    instruction: "Rewrite into clear everyday prose. Remove inflated wording, robotic transitions, and synthetic polish while preserving all facts and claims."
  },
  {
    id: "academic",
    label: "Academic",
    description: "Natural academic tone without stiffness.",
    temperature: 0.15,
    instruction: "Use an academic but human voice. Keep technical terms and careful claims, but avoid ceremonial phrasing, padded transitions, and overconfident generalizations."
  },
  {
    id: "simple",
    label: "Simple",
    description: "Plain, direct, easy to read.",
    temperature: 0.1,
    instruction: "Make the text simpler and more direct. Prefer short sentences, concrete verbs, and everyday wording. Do not remove important meaning."
  },
  {
    id: "flowing",
    label: "Flowing",
    description: "Smooth narrative rhythm.",
    temperature: 0.25,
    instruction: "Create a smoother human flow with varied sentence length and natural transitions. Avoid list-like cadence and repeated sentence openings."
  },
  {
    id: "informal",
    label: "Informal",
    description: "Casual but not sloppy.",
    temperature: 0.3,
    instruction: "Make the text sound more conversational and relaxed. Use contractions where they fit, but keep the output professional enough to share."
  },
  {
    id: "formal",
    label: "Formal",
    description: "Polished professional tone.",
    temperature: 0.15,
    instruction: "Use a formal professional voice without sounding machine-written. Keep it concise, specific, and controlled."
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add natural detail without inventing facts.",
    temperature: 0.25,
    instruction: "Expand the text slightly by making implied logic explicit and improving transitions. Do not add new facts, statistics, sources, or claims."
  },
  {
    id: "shorten",
    label: "Shorten",
    description: "Compress while sounding human.",
    temperature: 0.1,
    instruction: "Shorten the text while preserving the main meaning. Cut filler, duplicated points, throat-clearing, and generic AI phrasing."
  }
];

export const PRIMARY_MODE_IDS = ["standard", "academic", "simple", "flowing", "informal", "formal", "expand", "shorten"];
