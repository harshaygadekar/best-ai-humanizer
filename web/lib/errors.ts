export function providerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lowered = raw.toLowerCase();

  if (lowered.includes("groq_api_key") || lowered.includes("ollama_api_key")) {
    return "Provider API keys are missing. Add GROQ_API_KEY and OLLAMA_API_KEY to your local .env.local file and Vercel environment variables.";
  }

  if (lowered.includes("fetch failed") || lowered.includes("econnrefused") || lowered.includes("unable to connect")) {
    return "The hosted inference provider is not reachable right now. Check your internet connection and provider status, then try again.";
  }

  return raw || "Humanization failed.";
}
