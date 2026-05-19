"use client";

import { AlertTriangle, Check, CheckCircle, Clipboard, Copy, Eraser, Loader2, Settings, ShieldCheck, Sparkles, Wand2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { HUMANIZE_MODES } from "../lib/modes";
import { readabilityHint, wordCount } from "../lib/text";

const SAMPLE_TEXT =
  "In today's rapidly evolving digital landscape, artificial intelligence is revolutionizing the way individuals and organizations create content, enabling unprecedented levels of efficiency, scalability, and innovation across diverse communication workflows.";

type PrimaryProvider = "cerebras" | "groq" | "ollama-cloud";

type DetectorResult = {
  id: string;
  name: string;
  status: "pass" | "fail" | "error" | "skipped";
  aiScore: number;
  message?: string;
};

type DetectionReport = {
  overallAiPercent: number;
  verdict: string;
  flaggedCount: number;
  totalChecked: number;
  detectors: DetectorResult[];
  reliabilityWarning?: string;
  controlScore?: number;
};

export default function Home() {
  const [source, setSource] = useState("");
  const [output, setOutput] = useState("");
  const [modeId, setModeId] = useState("standard");
  const [primaryProvider, setPrimaryProvider] = useState<PrimaryProvider>("cerebras");
  const [cerebrasModel, setCerebrasModel] = useState("gpt-oss-120b");
  const [groqModel, setGroqModel] = useState("");
  const [ollamaCloudModel, setOllamaCloudModel] = useState("gemma4:31b-cloud");
  const [showSettings, setShowSettings] = useState(false);
  const [voiceSample, setVoiceSample] = useState("");
  const [error, setError] = useState("");
  const [providerLabel, setProviderLabel] = useState("");
  const [fallbackWarning, setFallbackWarning] = useState("");
  const [copied, setCopied] = useState(false);
  const [remainingTells, setRemainingTells] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Detection state
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionReport, setDetectionReport] = useState<DetectionReport | null>(null);
  const [detectError, setDetectError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeMode = useMemo(() => HUMANIZE_MODES.find((mode) => mode.id === modeId) ?? HUMANIZE_MODES[0], [modeId]);
  const sourceWords = wordCount(source);
  const outputWords = wordCount(output);

  function startCooldown() {
    setCooldown(10);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDefaults() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) return;

        const data = (await response.json()) as {
          primaryProvider?: PrimaryProvider;
          cerebrasModel?: string;
          groqModel?: string;
          ollamaCloudModel?: string;
        };

        if (!isMounted) return;

        if (data.primaryProvider) {
          setPrimaryProvider(data.primaryProvider);
        }
        if (data.cerebrasModel) {
          setCerebrasModel(data.cerebrasModel);
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
    setFallbackWarning("");
    setCopied(false);
    setRemainingTells([]);
    setDetectionReport(null);
    setDetectError("");

    if (!source.trim()) {
      setError("Paste some text first.");
      return;
    }

    startTransition(async () => {
      try {
        const data = await humanizeOnServer();
        setOutput(data.text);
        setRemainingTells(data.remainingTells ?? []);

        const providerNames: Record<string, string> = {
          cerebras: "Cerebras",
          groq: "Groq",
          "ollama-cloud": "Ollama Cloud",
        };
        setProviderLabel(`${providerNames[data.provider] || data.provider} / ${data.model}`);

        // Show a warning if any fallback providers were tried before success
        if (data.fallbackErrors?.length) {
          setFallbackWarning(`Primary provider failed, used fallback. Errors: ${data.fallbackErrors.join("; ")}`);
        }
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
        cerebrasModel: cerebrasModel || undefined,
        groqModel: groqModel || undefined,
        ollamaCloudModel: ollamaCloudModel || undefined,
        voiceSample
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Server request failed.");
    }
    return data as {
      text: string;
      remainingTells?: string[];
      provider: string;
      model: string;
      fallbackErrors?: string[];
    };
  }

  const checkForAI = useCallback(async () => {
    if (!output.trim() || isDetecting || cooldown > 0) return;

    setIsDetecting(true);
    setDetectError("");
    setDetectionReport(null);

    try {
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: output })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Detection failed.");
      }
      setDetectionReport(data as DetectionReport);
      startCooldown();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "AI detection failed.";
      setDetectError(message);
    } finally {
      setIsDetecting(false);
    }
  }, [output, isDetecting, cooldown]);

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
              <span>Provider chain</span>
              <select value={primaryProvider} onChange={(event) => setPrimaryProvider(event.target.value as PrimaryProvider)}>
                <option value="cerebras">Cerebras → Ollama Cloud → Groq</option>
                <option value="ollama-cloud">Ollama Cloud → Cerebras → Groq</option>
                <option value="groq">Groq → Cerebras → Ollama Cloud</option>
              </select>
            </label>
            <label>
              <span>Cerebras model</span>
              <input value={cerebrasModel} onChange={(event) => setCerebrasModel(event.target.value)} placeholder="gpt-oss-120b" />
            </label>
            <label>
              <span>Groq model</span>
              <input value={groqModel} onChange={(event) => setGroqModel(event.target.value)} placeholder="Loading server default..." />
            </label>
            <label>
              <span>Ollama Cloud model</span>
              <input value={ollamaCloudModel} onChange={(event) => setOllamaCloudModel(event.target.value)} placeholder="gemma4:31b-cloud" />
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
              <button
                className="detectButton"
                type="button"
                onClick={checkForAI}
                disabled={!output.trim() || isDetecting || cooldown > 0}
                aria-label="Check for AI content"
              >
                {isDetecting ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <ShieldCheck size={15} />
                )}
                {isDetecting ? "Checking…" : cooldown > 0 ? `Wait ${cooldown}s` : "Check for AI"}
              </button>
            </div>
          </section>
        </div>

        {fallbackWarning ? (
          <div className="warningBox">
            <AlertTriangle size={16} />
            <span>{fallbackWarning}</span>
          </div>
        ) : null}
        {error ? <div className="errorBox">{error}</div> : null}
        {detectError ? <div className="errorBox">{detectError}</div> : null}

        {/* Detection loading state */}
        {isDetecting && !detectionReport ? (
          <div className="detectionPanel">
            <div className="detectionLoading">
              <Loader2 className="spin" size={22} />
              <span>Cross-checking with AI detectors…</span>
            </div>
          </div>
        ) : null}

        {/* Detection results panel */}
        {detectionReport ? <DetectionPanel report={detectionReport} /> : null}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Detection Report Panel
// ---------------------------------------------------------------------------

function DetectionPanel({ report }: { report: DetectionReport }) {
  const { overallAiPercent, verdict, flaggedCount, totalChecked, detectors } = report;

  // Only show detectors that were actually called (not skipped).
  // Sapling is hidden while disabled — re-enable in route.ts when ready.
  const activeDetectors = detectors.filter((d) => d.status !== "skipped" && d.id !== "sapling");

  const verdictClass =
    overallAiPercent < 30 ? "verdictHuman" : overallAiPercent <= 70 ? "verdictMixed" : "verdictAi";

  const scoreClass =
    overallAiPercent < 30 ? "scoreHuman" : overallAiPercent <= 70 ? "scoreMixed" : "scoreAi";

  const VerdictIconComponent =
    overallAiPercent < 30 ? CheckCircle : overallAiPercent <= 70 ? AlertTriangle : XCircle;

  const flagSummary =
    totalChecked === 0
      ? "No detectors were available to check."
      : `${flaggedCount} of ${totalChecked} detector${totalChecked !== 1 ? "s" : ""} flagged AI.`;

  // Build conic-gradient for donut chart
  const aiColor = overallAiPercent < 30 ? "#4ade80" : overallAiPercent <= 70 ? "#fbbf24" : "#f87171";
  const trackColor = "rgba(255,255,255,0.08)";
  const donutGradient = `conic-gradient(${aiColor} 0% ${overallAiPercent}%, ${trackColor} ${overallAiPercent}% 100%)`;

  return (
    <div className="detectionPanel" role="region" aria-label="AI detection results">
      {/* Verdict banner */}
      <div className={`detectionBanner ${verdictClass}`}>
        <div className="verdictIcon">
          <VerdictIconComponent size={18} />
        </div>
        <div className="verdictText">
          <h3>{verdict}</h3>
          <p>{flagSummary}</p>
          {report.reliabilityWarning ? (
            <p className="reliabilityNote">{report.reliabilityWarning}</p>
          ) : null}
        </div>
      </div>

      {/* Body: donut chart + detector badges */}
      {activeDetectors.length > 0 ? (
        <div className="detectionBody">
          {/* Donut chart */}
          <div className={`donutWrap ${scoreClass}`}>
            <div
              className="donutChart"
              style={{ "--donut-gradient": donutGradient } as React.CSSProperties}
            >
              <div className="donutCenter">
                <span className="donutPercent">{overallAiPercent}%</span>
                <span className="donutLabel">AI GPT</span>
              </div>
            </div>
          </div>

          {/* Detector badges */}
          <div className="detectorSection">
            <p className="detectorSectionLabel">Cross-checked with:</p>
            <div className="detectorGrid">
              {activeDetectors.map((detector) => (
                <div key={detector.id} className="detectorBadge">
                  <span className={`statusDot ${detector.status}`} />
                  <span>{detector.name}</span>
                  {(detector.status === "pass" || detector.status === "fail") ? (
                    <span className="detectorScore">{detector.aiScore}%</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
