import { describe, expect, it, vi } from "vitest";
import { ConcurrencyLimiter } from "../lib/concurrency";
import { handleHumanizeRequest, type HumanizeHandlerDeps } from "../lib/humanize-handler";

type HumanizeResponse = {
  finalText: string;
  remainingTells: string[];
  usage: Record<string, unknown>;
  provider: "groq";
  model: string;
  fallbackErrors: string[];
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("humanize handler concurrency", () => {
  it("allows five concurrent long requests and rejects the sixth", async () => {
    const limiter = new ConcurrencyLimiter(5);
    const deferreds = Array.from({ length: 5 }, () => createDeferred<HumanizeResponse>());
    let callIndex = 0;

    const humanize = vi.fn(async () => {
      const deferred = deferreds[callIndex++];
      if (!deferred) {
        throw new Error("Unexpected extra provider call");
      }

      return deferred.promise;
    }) as NonNullable<HumanizeHandlerDeps["humanize"]>;

    const body = {
      text: Array.from({ length: 50 }, (_, index) => `Paragraph ${index + 1}.`).join(" "),
      modeId: "standard"
    };

    const requests = Array.from({ length: 5 }, () =>
      handleHumanizeRequest(body, {
        limiter,
        humanize,
        groqApiKey: "test-groq",
        ollamaApiKey: "test-ollama"
      })
    );

    const rejected = await handleHumanizeRequest(body, {
      limiter,
      humanize,
      groqApiKey: "test-groq",
      ollamaApiKey: "test-ollama"
    });

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("Retry-After")).toBe("2");

    for (const deferred of deferreds) {
      deferred.resolve({
        finalText: "ok",
        remainingTells: [],
        usage: {},
        provider: "groq",
        model: "llama-3.1-8b-instant",
        fallbackErrors: []
      });
    }

    const responses = await Promise.all(requests);

    expect(humanize).toHaveBeenCalledTimes(5);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ text: "ok", provider: "groq" });
    }
  });

  it("releases a slot after a provider failure", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const humanize = vi.fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        finalText: "recovered",
        remainingTells: [],
        usage: {},
        provider: "groq" as const,
        model: "llama-3.1-8b-instant",
        fallbackErrors: [] as string[]
      });

    const body = { text: "Short test text.", modeId: "standard" };

    const first = await handleHumanizeRequest(body, {
      limiter,
      humanize,
      groqApiKey: "test-groq",
      ollamaApiKey: "test-ollama"
    });

    expect(first.status).toBe(500);
    expect(limiter.getActiveCount()).toBe(0);

    const second = await handleHumanizeRequest(body, {
      limiter,
      humanize,
      groqApiKey: "test-groq",
      ollamaApiKey: "test-ollama"
    });

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ text: "recovered" });
  });
});