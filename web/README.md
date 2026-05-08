# AI Humanizer Web

Next.js web version of the AI Humanizer app. It uses hosted inference so Vercel deployments do not depend on a local Ollama process.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Providers

Default primary provider: Groq

Default Groq model: `llama-3.1-8b-instant`

Default fallback provider: Ollama Cloud

Default Ollama Cloud model: `gpt-oss:120b`

Create `.env.local` for local development:

```bash
GROQ_API_KEY=your_groq_key
OLLAMA_API_KEY=your_ollama_key
PRIMARY_PROVIDER=groq
GROQ_MODEL=llama-3.1-8b-instant
OLLAMA_CLOUD_MODEL=gpt-oss:120b
```

For Vercel, add the same environment variables in Project Settings.

The humanize API also enforces a per-instance concurrency cap of 5 active requests. If the app is already busy, extra requests get a retryable `429 Too Many Requests` response with a short `Retry-After` hint.

## Scripts

```bash
npm test
npm run build
```

## Vercel

The app uses standard Next.js App Router defaults, so Vercel can build it with:

- Build command: `npm run build`
- Output directory: `.next`
- Required env vars: `GROQ_API_KEY`, `OLLAMA_API_KEY`
- Optional env vars: `PRIMARY_PROVIDER`, `GROQ_MODEL`, `OLLAMA_CLOUD_MODEL`
