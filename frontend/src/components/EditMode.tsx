import { useCallback, useEffect, useRef, useState } from "react";

import {
  editAccept,
  editApply,
  editCleanupBackups,
  editManual,
  editPause,
  editQueue,
  editQueueNext,
  editReject,
  editResume,
  editRollbackAll,
  editRun,
  editStart,
  editStatus,
} from "../api";
import ProgressBar from "./ProgressBar";
import ReviewCard from "./edit/ReviewCard";

interface SessionInfo {
  session_id: string;
  total_images: number;
  gps_images_skipped: number;
  to_process: number;
  disagreements: number;
  warnings: string[];
}

interface QueueItem {
  image_id: string;
  filename: string;
  status: string;
  predictions: null | Array<{
    rank: number;
    lat: number;
    lon: number;
    probability: number;
    address: { city: string; region: string; country: string } | null;
  }>;
}

interface CurrentReview {
  image_id: string;
  filename: string;
  thumbnail_base64: string;
  predictions: Array<{
    rank: number;
    lat: number;
    lon: number;
    probability: number;
    address: { city: string; region: string; country: string } | null;
  }>;
}

export default function EditMode() {
  const [directory, setDirectory] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inferenceStatus, setInferenceStatus] = useState<string>("ready");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<CurrentReview | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- session setup ---- */

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const info = await editStart(directory);
      setSession(info);
      setSessionId(info.session_id);
      setInferenceStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }, [directory]);

  /* ---- inference control ---- */

  const handleRun = useCallback(async () => {
    if (!sessionId) return;
    await editRun(sessionId);
    setInferenceStatus("running");
    setTotal(session?.to_process ?? 0);
  }, [sessionId, session]);

  const handlePause = useCallback(async () => {
    if (sessionId) await editPause(sessionId);
  }, [sessionId]);

  const handleResume = useCallback(async () => {
    if (!sessionId) return;
    await editResume(sessionId);
    setInferenceStatus("running");
  }, [sessionId]);

  /* ---- poll inference status ---- */

  useEffect(() => {
    if (!sessionId || inferenceStatus !== "running") return;

    const poll = setInterval(async () => {
      try {
        const s = await editStatus(sessionId);
        setProcessed(s.processed);
        setTotal(s.total);
        setCurrentImage(s.current_image);
        setInferenceStatus(s.status);

        if (s.status === "complete" || s.status === "paused") {
          clearInterval(poll);
          refreshQueue();
        }
      } catch {
        /* keep polling */
      }
    }, 1500);

    pollRef.current = poll;
    return () => clearInterval(poll);
  }, [sessionId, inferenceStatus]);

  /* ---- queue management ---- */

  const refreshQueue = useCallback(async () => {
    if (!sessionId) return;
    const { items } = await editQueue(sessionId, 0, 500);
    setQueue(items);
  }, [sessionId]);

  const loadNext = useCallback(async () => {
    if (!sessionId) return;
    setFeedback(null);
    try {
      const item = await editQueueNext(sessionId);
      setCurrent(item);
      const idx = queue.findIndex((q) => q.image_id === item.image_id);
      if (idx >= 0) setReviewIndex(idx);
    } catch {
      setCurrent(null);
      setShowSummary(true);
    }
  }, [sessionId, queue]);

  // Load first review item when inference completes
  useEffect(() => {
    if (inferenceStatus === "complete" && queue.length > 0 && !current) {
      loadNext();
    }
  }, [inferenceStatus, queue, current, loadNext]);

  /* ---- review actions ---- */

  const handleAccept = useCallback(async () => {
    if (!sessionId || !current || busy) return;
    setBusy(true);
    try {
      await editAccept(sessionId, current.image_id);
      const applyResult = await editApply(sessionId, current.image_id);
      if (applyResult.success) {
        const c = applyResult.coordinates;
        setFeedback(`GPS written: ${c?.lat.toFixed(4)}, ${c?.lon.toFixed(4)}`);
      } else {
        setFeedback(`Write failed: ${applyResult.error}`);
      }
      await refreshQueue();
      setTimeout(() => loadNext(), 800);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }, [sessionId, current, busy, refreshQueue, loadNext]);

  const handleReject = useCallback(async () => {
    if (!sessionId || !current || busy) return;
    setBusy(true);
    try {
      await editReject(sessionId, current.image_id);
      setFeedback("Skipped");
      await refreshQueue();
      setTimeout(() => loadNext(), 500);
    } finally {
      setBusy(false);
    }
  }, [sessionId, current, busy, refreshQueue, loadNext]);

  const handleManual = useCallback(
    async (address: string) => {
      if (!sessionId || !current || busy) return;
      setBusy(true);
      try {
        const result = await editManual(sessionId, current.image_id, address);
        await editApply(sessionId, current.image_id);
        setFeedback(
          `Manual GPS: ${result.coordinates.lat.toFixed(4)}, ${result.coordinates.lon.toFixed(4)}`,
        );
        await refreshQueue();
        setTimeout(() => loadNext(), 800);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "Geocoding failed");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, current, busy, refreshQueue, loadNext],
  );

  /* ---- filmstrip click ---- */

  const jumpTo = useCallback(
    async (item: QueueItem) => {
      if (!sessionId || item.status === "queued") return;
      setFeedback(null);
      try {
        const full = await editQueueNext(sessionId);
        // Try to load this specific item — fall back to next
        if (full.image_id === item.image_id) {
          setCurrent(full);
        }
      } catch {
        /* ignore */
      }
    },
    [sessionId],
  );

  /* ---- summary actions ---- */

  const handleRollbackAll = useCallback(async () => {
    if (!sessionId || !confirm("Undo ALL GPS writes from this session?"))
      return;
    const result = await editRollbackAll(sessionId);
    alert(`Rolled back ${result.rolled_back} images.`);
    await refreshQueue();
  }, [sessionId, refreshQueue]);

  const handleCleanup = useCallback(async () => {
    if (
      !sessionId ||
      !confirm(
        "This permanently removes backup files. You will NOT be able to undo GPS changes. Continue?",
      )
    )
      return;
    const result = await editCleanupBackups(sessionId);
    alert(`Cleaned up ${result.cleaned} backup files.`);
  }, [sessionId]);

  /* ---- computed stats ---- */

  const accepted = queue.filter(
    (q) => q.status === "accepted" || q.status === "manual",
  ).length;
  const rejected = queue.filter((q) => q.status === "rejected").length;
  const pending = queue.filter((q) => q.status === "pending_review").length;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ---- setup ---- */}
      {!session && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="Directory path (leave empty for all)"
              className="flex-1 bg-white border border-gray-200 shadow-sm rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleStart}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Start Edit Session
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Scans the directory and identifies images without GPS data for
            analysis.
          </p>
        </div>
      )}

      {/* ---- session overview ---- */}
      {session && inferenceStatus === "ready" && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Session Ready</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-gray-900">
                {session.total_images}
              </p>
              <p className="text-[10px] text-gray-400 uppercase">Total</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-gray-500">
                {session.gps_images_skipped}
              </p>
              <p className="text-[10px] text-gray-400 uppercase">
                Have GPS (skipped)
              </p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-blue-600">
                {session.to_process}
              </p>
              <p className="text-[10px] text-gray-400 uppercase">
                Ready to analyze
              </p>
            </div>
          </div>
          {session.disagreements > 0 && (
            <p className="text-xs text-yellow-600">
              {session.disagreements} image(s) excluded due to ambiguous
              metadata (safety check)
            </p>
          )}
          <button
            onClick={handleRun}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
          >
            Start Analysis ({session.to_process} images)
          </button>
        </div>
      )}

      {/* ---- inference progress ---- */}
      {inferenceStatus === "running" && (
        <div className="space-y-2">
          <ProgressBar
            done={processed}
            total={total}
            currentItem={currentImage}
            label="Analyzing"
          />
          <div className="flex justify-end">
            <button
              onClick={handlePause}
              className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Pause
            </button>
          </div>
        </div>
      )}

      {inferenceStatus === "paused" && (
        <div className="bg-white border border-yellow-300 shadow-sm rounded-2xl p-5 flex items-center justify-between">
          <p className="text-sm text-yellow-600">
            Paused — {processed}/{total} processed
          </p>
          <button
            onClick={handleResume}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
          >
            Resume
          </button>
        </div>
      )}

      {/* ---- filmstrip ---- */}
      {queue.length > 0 && !showSummary && (
        <div className="flex gap-1 overflow-x-auto py-2">
          {queue.map((q, i) => {
            const color =
              q.status === "accepted"
                ? "ring-emerald-500"
                : q.status === "manual"
                  ? "ring-blue-500"
                  : q.status === "rejected"
                    ? "ring-gray-400"
                    : q.status === "pending_review"
                      ? "ring-gray-400"
                      : "ring-gray-200";
            const isActive = current?.image_id === q.image_id;
            return (
              <button
                key={q.image_id}
                onClick={() => jumpTo(q)}
                className={`w-8 h-8 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold ring-2 transition-all ${color} ${isActive ? "scale-110 bg-gray-200" : "bg-gray-100 hover:bg-gray-200"}`}
                title={`${q.filename} — ${q.status}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* ---- review card ---- */}
      {current && !showSummary && (
        <div>
          <p className="text-xs text-gray-400 mb-2">
            Reviewing image {reviewIndex + 1} of {queue.length} · {pending}{" "}
            remaining
          </p>
          <ReviewCard
            imageId={current.image_id}
            filename={current.filename}
            thumbnail={current.thumbnail_base64}
            predictions={current.predictions}
            onAccept={handleAccept}
            onReject={handleReject}
            onManual={handleManual}
            busy={busy}
            feedback={feedback}
          />
        </div>
      )}

      {/* ---- summary ---- */}
      {showSummary && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">
            Session Complete
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-emerald-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-emerald-600">{accepted}</p>
              <p className="text-[10px] text-gray-400 uppercase">GPS Applied</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-gray-500">{rejected}</p>
              <p className="text-[10px] text-gray-400 uppercase">Rejected</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-3">
              <p className="text-lg font-bold text-blue-600">{pending}</p>
              <p className="text-[10px] text-gray-400 uppercase">
                Still Pending
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRollbackAll}
              className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-xl transition-colors border border-red-200"
            >
              Rollback All
            </button>
            <button
              onClick={handleCleanup}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
            >
              Clean Up Backups
            </button>
          </div>
          <button
            onClick={() => {
              setSession(null);
              setSessionId(null);
              setQueue([]);
              setCurrent(null);
              setShowSummary(false);
              setInferenceStatus("ready");
            }}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
          >
            Start New Session
          </button>
        </div>
      )}
    </div>
  );
}
