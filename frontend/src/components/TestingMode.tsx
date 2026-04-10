import { useCallback, useRef, useState } from "react";

import { checkHealth, predictSingle } from "../api";
import type { AnalysisResult, SelectedFile } from "../types";
import FilePreview from "./FilePreview";
import OverviewMap from "./OverviewMap";
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
          <SettingsPanel topK={topK} onTopKChange={setTopK} />

          {pendingCount > 0 && !processing && (
            <button
              onClick={runAnalysis}
              className="mt-6 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:shadow-indigo-200 dark:hover:shadow-indigo-900 active:scale-[0.99]"
            >
              Run Analysis{pendingCount > 1 ? ` (${pendingCount} images)` : ""}
            </button>
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
