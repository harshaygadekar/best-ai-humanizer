"use client";

import { Check, Clipboard, Copy, Eraser, Loader2, Settings, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { HUMANIZE_MODES } from "../lib/modes";
import { readabilityHint, wordCount } from "../lib/text";

const SAMPLE_TEXT =
  "In today's rapidly evolving digital landscape, artificial intelligence is revolutionizing the way individuals and organizations create content, enabling unprecedented levels of efficiency, scalability, and innovation across diverse communication workflows.";

type PrimaryProvider = "groq" | "ollama-cloud";

export default function Home() {
  const [source, setSource] = useState("");
  const [output, setOutput] = useState("");
  const [modeId, setModeId] = useState("standard");
  const [primaryProvider, setPrimaryProvider] = useState<PrimaryProvider>("groq");
  const [groqModel, setGroqModel] = useState("");
  const [ollamaCloudModel, setOllamaCloudModel] = useState("gpt-oss:120b");
  const [showSettings, setShowSettings] = useState(false);
  const [voiceSample, setVoiceSample] = useState("");
  const [error, setError] = useState("");
  const [providerLabel, setProviderLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [remainingTells, setRemainingTells] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const activeMode = useMemo(() => HUMANIZE_MODES.find((mode) => mode.id === modeId) ?? HUMANIZE_MODES[0], [modeId]);
  const sourceWords = wordCount(source);
  const outputWords = wordCount(output);

  useEffect(() => {
    let isMounted = true;

    async function loadDefaults() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) return;

        const data = (await response.json()) as {
          primaryProvider?: PrimaryProvider;
          groqModel?: string;
          ollamaCloudModel?: string;
        };

        if (!isMounted) return;

        if (data.primaryProvider) {
          setPrimaryProvider(data.primaryProvider);
        }
        if (data.groqModel) {
          setGroqModel(data.groqModel);
        }
        if (data.ollamaCloudModel) {
          setOllamaCloudModel(data.ollamaCloudModel);
        }
      } catch {
        // Keep local fallbacks if the config endpoint is unavailable.
      }
    }

    loadDefaults();

    return () => {
      isMounted = false;
    };
  }, []);

  function humanize() {
    setError("");
    setProviderLabel("");
    setCopied(false);
    setRemainingTells([]);

    if (!source.trim()) {
      setError("Paste some text first.");
      return;
    }

    startTransition(async () => {
      try {
        const data = await humanizeOnServer();
        setOutput(data.text);
        setRemainingTells(data.remainingTells ?? []);
        setProviderLabel(`${data.provider === "groq" ? "Groq" : "Ollama Cloud"} / ${data.model}`);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Humanization failed.";
        setError(message);
      }
    });
  }

  async function humanizeOnServer() {
    const response = await fetch("/api/humanize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: source,
        modeId,
        primaryProvider,
        groqModel: groqModel || undefined,
        ollamaCloudModel: ollamaCloudModel || undefined,
        voiceSample
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Server request failed.");
    }
    return data as { text: string; remainingTells?: string[]; provider: PrimaryProvider; model: string };
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="title">
        <h1 id="title">Humanize AI text with the smartest AI humanizer</h1>
        <p>
          Transform AI-generated content into natural, human-like text with a fast local-first editor. It keeps your meaning intact while removing synthetic rhythm, generic phrasing, and polished AI tells.
        </p>
      </section>

      <section className="workspace" aria-label="AI humanizer workspace">
        <nav className="modeBar" aria-label="Humanization modes">
          {HUMANIZE_MODES.map((mode) => (
            <button key={mode.id} className={mode.id === modeId ? "mode active" : "mode"} onClick={() => setModeId(mode.id)} type="button">
              {mode.label}
            </button>
          ))}
        </nav>

        <div className="metaStrip">
          <div>
            <Sparkles size={16} />
            <span>{activeMode.description}</span>
          </div>
          <button className="settingsButton" onClick={() => setShowSettings((value) => !value)} type="button">
            <Settings size={16} /> Settings
          </button>
        </div>

        {showSettings ? (
          <div className="settingsPanel">
            <label>
              <span>Main provider</span>
              <select value={primaryProvider} onChange={(event) => setPrimaryProvider(event.target.value as PrimaryProvider)}>
                <option value="groq">Groq first, Ollama Cloud fallback</option>
                <option value="ollama-cloud">Ollama Cloud first, Groq fallback</option>
              </select>
            </label>
            <label>
              <span>Groq model</span>
              <input value={groqModel} onChange={(event) => setGroqModel(event.target.value)} placeholder="Loading server default..." />
            </label>
            <label>
              <span>Ollama Cloud model</span>
              <input value={ollamaCloudModel} onChange={(event) => setOllamaCloudModel(event.target.value)} placeholder="gpt-oss:120b" />
            </label>
            <label className="wide">
              <span>Optional voice sample</span>
              <textarea value={voiceSample} onChange={(event) => setVoiceSample(event.target.value)} placeholder="Paste a short sample of your writing style..." />
            </label>
          </div>
        ) : null}

        <div className="editorGrid">
          <section className="pane">
            <div className="paneTop">
              <h2>Paste your text here — English or Spanish</h2>
              <button className="ghostIcon" type="button" onClick={() => setSource("")} aria-label="Clear input">
                <Eraser size={17} />
              </button>
            </div>
            <textarea className="textBox" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste AI-generated text here..." />
            {!source ? (
              <button className="sampleButton" type="button" onClick={() => setSource(SAMPLE_TEXT)}>
                Try a sample <Sparkles size={18} />
              </button>
            ) : null}
            <div className="paneFooter">
              <span>{sourceWords} words</span>
              <span>{readabilityHint(source)}</span>
              <button className="primaryButton" disabled={isPending || !source.trim()} onClick={humanize} type="button">
                {isPending ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
                {isPending ? "Humanizing" : "Humanize AI"}
              </button>
            </div>
          </section>

          <section className="pane outputPane">
            <div className="paneTop">
              <h2>Paraphrased text will appear here</h2>
              <button className="ghostIcon" type="button" onClick={copyOutput} aria-label="Copy output" disabled={!output}>
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <div className={isPending ? "output loading" : "output"}>
              {isPending ? (
                <div className="loadingState">
                  <Loader2 className="spin" size={26} />
                  <span>Rewriting with {activeMode.label.toLowerCase()} mode...</span>
                </div>
              ) : output ? (
                <p>{output}</p>
              ) : (
                <div className="emptyState">
                  <Clipboard size={34} />
                  <span>Your rewritten text stays here for quick review and copy.</span>
                </div>
              )}
            </div>
            <div className="paneFooter outputFooter">
              <span>{outputWords} words</span>
              <span>{providerLabel || (remainingTells.length ? `${remainingTells.length} notes left` : "Private audit clean")}</span>
            </div>
          </section>
        </div>

        {error ? <div className="errorBox">{error}</div> : null}
      </section>
    </main>
  );
}
