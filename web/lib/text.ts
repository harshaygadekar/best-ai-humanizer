export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function sentenceCount(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  if (matches?.length) {
    return matches.length;
  }
  return text.trim() ? 1 : 0;
}

export function readabilityHint(text: string): string {
  const words = wordCount(text);
  const sentences = sentenceCount(text);
  if (!words) {
    return "Waiting for text";
  }
  const average = words / Math.max(sentences, 1);
  if (average > 28) {
    return "Long sentence risk";
  }
  if (average < 9) {
    return "Short and punchy";
  }
  return "Balanced rhythm";
}
