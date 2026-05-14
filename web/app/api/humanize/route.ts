import { ConcurrencyLimiter } from "../../../lib/concurrency";
import { handleHumanizeRequest } from "../../../lib/humanize-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

const humanizeLimiter = new ConcurrencyLimiter(5);

export async function POST(request: Request) {
  const body = await request.json();

  return handleHumanizeRequest(body, {
    limiter: humanizeLimiter,
    primaryProviderDefault: process.env.PRIMARY_PROVIDER,
    cerebrasApiKey: process.env.CEREBRAS_API_KEY || "",
    groqApiKey: process.env.GROQ_API_KEY || "",
    ollamaApiKey: process.env.OLLAMA_API_KEY || "",
    cerebrasModelDefault: process.env.CEREBRAS_MODEL,
    groqModelDefault: process.env.GROQ_MODEL,
    ollamaCloudModelDefault: process.env.OLLAMA_CLOUD_MODEL
  });
}
