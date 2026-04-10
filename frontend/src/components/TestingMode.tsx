import { useCallback, useRef, useState } from "react";

import { checkHealth, predictSingle } from "../api";
import type { AnalysisResult, SelectedFile } from "../types";
import FilePreview from "./FilePreview";
import OverviewMap from "./OverviewMap";
import PrivacyNote from "./PrivacyNote";
import ProgressBar from "./ProgressBar";
import ResultCard from "./ResultCard";
import SettingsPanel from "./SettingsPanel";
import StatsPanel from "./StatsPanel";
import UploadZone from "./UploadZone";

export default function TestingMode() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [topK, setTopK] = useState(5);
  const [processing, setProcessing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const next: SelectedFile[] = incoming.map((f) => ({
      file: f,
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      previewUrl: URL.createObjectURL(f),
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...next]);
    setCollapsed(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const hit = prev.find((f) => f.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const runAnalysis = useCallback(async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setProgressDone(0);
    setProgressTotal(pending.length);

    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "processing" as const } : f,
      ),
    );

    for (let i = 0; i < pending.length; i++) {
      if (controller.signal.aborted) return;

      const sf = pending[i];
      setCurrentFile(sf.file.name);

      try {
        const r = await predictSingle(sf.file, topK);
        const result: AnalysisResult = {
          ...r,
          id: sf.id,
          filename: sf.file.name,
          imageUrl: sf.previewUrl,
        };

        setFiles((prev) =>
          prev.map((f) =>
            f.id === sf.id ? { ...f, status: "done" as const } : f,
          ),
        );
        setResults((prev) => [result, ...prev]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Failed";
        setFiles((prev) =>
          prev.map((f) =>
            f.id === sf.id ? { ...f, status: "error" as const, error: msg } : f,
          ),
        );
      }

      setProgressDone(i + 1);
    }

    if (!controller.signal.aborted) {
      setProcessing(false);
      setCurrentFile(null);
      setCollapsed(true);
    }
  }, [files, topK]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setResults([]);
    setProcessing(false);
    setCollapsed(false);
    setError(null);
    setProgressDone(0);
    setProgressTotal(0);
    setCurrentFile(null);
    cardRefs.current.clear();
  }, [files]);

  const retry = useCallback(async () => {
    setError(null);
    try {
      await checkHealth();
    } catch {
      setError("Backend is still unreachable.");
    }
  }, []);

  const scrollToCard = useCallback((id: string) => {
    cardRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const hasContent = files.length > 0 || results.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-2xl shadow-sm flex items-center justify-between animate-slide-down">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={retry}
            className="text-sm text-red-500 hover:text-red-700 underline ml-4 flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {!hasContent && !processing && (
        <div className="mb-6 text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Where was this photo taken?
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Drop a photo below and an AI model will predict its location on a
            map. If the photo has EXIF GPS data, you'll see a benchmark
            comparing the prediction to the real location.
          </p>
        </div>
      )}

      {collapsed && results.length > 0 ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full text-center py-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 transition-all duration-300"
        >
          + Upload more images
        </button>
      ) : (
        <>
          <UploadZone onFilesSelected={addFiles} disabled={processing} />
          <FilePreview
            files={files}
            onRemove={removeFile}
            disabled={processing}
          />

          {!hasContent && !processing && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FeatureCard
                icon="brain"
                title="AI-powered"
                desc="GeoCLIP deep learning model trained on millions of geotagged images"
              />
              <FeatureCard
                icon="lock"
                title="100% local"
                desc="Your photos never leave this machine. All inference runs locally on CPU or GPU."
              />
              <FeatureCard
                icon="chart"
                title="Benchmarked"
                desc="If your photo has EXIF GPS, you see the true location and the prediction distance"
              />
            </div>
          )}

          <SettingsPanel topK={topK} onTopKChange={setTopK} />

          {pendingCount > 0 && !processing && (
            <div className="mt-6">
              <button
                onClick={runAnalysis}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:shadow-indigo-200 dark:hover:shadow-indigo-900 active:scale-[0.99]"
              >
                Run Analysis
                {pendingCount > 1 ? ` (${pendingCount} images)` : ""}
              </button>
              <PrivacyNote className="mt-2" />
            </div>
          )}

          {processing && (
            <div className="mt-6 space-y-2">
              <ProgressBar
                done={progressDone}
                total={progressTotal}
                currentItem={currentFile}
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    abortRef.current?.abort();
                    setProcessing(false);
                  }}
                  className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                >
                  Abort
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {hasContent && !processing && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={reset}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-200"
          >
            Clear All
          </button>
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-4 space-y-4">
          <div className="border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden animate-fade-in-up">
            <OverviewMap results={results} onMarkerClick={scrollToCard} />
          </div>
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
          >
            <StatsPanel results={results} onRowClick={scrollToCard} />
          </div>
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">
            Results ({results.length})
          </h2>
          {results.map((r, i) => (
            <div
              key={r.id}
              ref={(el) => {
                if (el) cardRefs.current.set(r.id, el);
                else cardRefs.current.delete(r.id);
              }}
              className="animate-fade-in-up"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "backwards",
              }}
            >
              <ResultCard result={r} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: "brain" | "lock" | "chart";
  title: string;
  desc: string;
}) {
  const path =
    icon === "brain"
      ? "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
      : icon === "lock"
        ? "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        : "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z";

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 text-center hover:shadow-md transition-shadow duration-300">
      <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
        <svg
          className="w-5 h-5 text-indigo-500 dark:text-indigo-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={path} />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
        {title}
      </p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
