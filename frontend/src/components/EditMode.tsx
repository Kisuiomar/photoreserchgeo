import { useCallback, useEffect, useRef, useState } from "react";

import {
  editAccept,
  editApply,
  editCleanupBackups,
  editManual,
  editPause,
  editQueueNext,
  editReject,
  editResume,
  editRollbackAll,
  editRoundSummary,
  editStart,
  editStartRound,
  editStatus,
} from "../api";
import ProgressBar from "./ProgressBar";
import ReviewCard from "./edit/ReviewCard";

type Step =
  | "config"
  | "scanned"
  | "processing"
  | "paused"
  | "review"
  | "round_complete"
  | "session_complete";

interface SessionInfo {
  session_id: string;
  total_images: number;
  real_gps_count: number;
  predicted_gps_count: number;
  no_gps_count: number;
  disagreements: number;
  warnings: string[];
}

interface RoundInfo {
  round: number;
  candidates: number;
  reference_gps: number;
}

interface RoundSummary {
  round_num: number;
  total_candidates: number;
  above_threshold: number;
  below_threshold: number;
  accepted: number;
  rejected: number;
  pending_review: number;
  auto_skipped: number;
  remaining_unlocated: number;
  reference_gps_count: number;
}

interface CurrentReview {
  image_id: string;
  filename: string;
  thumbnail_base64: string;
  combined_score: number;
  model_confidence: number;
  temporal_confidence: number;
  temporal_source: string | null;
  predictions: Array<{
    rank: number;
    lat: number;
    lon: number;
    probability: number;
    address: { city: string; region: string; country: string } | null;
  }>;
}

export default function EditMode() {
  const [step, setStep] = useState<Step>("config");
  const [directory, setDirectory] = useState("");
  const [threshold, setThreshold] = useState(0.3);
  const [includePredicted, setIncludePredicted] = useState(false);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);

  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [aboveThreshold, setAboveThreshold] = useState(0);
  const [belowThreshold, setBelowThreshold] = useState(0);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(0);

  const [current, setCurrent] = useState<CurrentReview | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Step 1: Start session (scan directory) ---- */

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const info = await editStart(directory, threshold, includePredicted);
      setSession(info);
      setSessionId(info.session_id);
      setStep("scanned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    }
  }, [directory, threshold, includePredicted]);

  /* ---- Step 2: Start a round ---- */

  const handleStartRound = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const info = await editStartRound(sessionId);
      setRoundInfo(info);
      setCurrentRound(info.round);
      setTotal(info.candidates);
      setProcessed(0);
      setAboveThreshold(0);
      setBelowThreshold(0);

      if (info.status === "no_candidates") {
        setStep("session_complete");
      } else {
        setStep("processing");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start round");
    }
  }, [sessionId]);

  /* ---- Poll inference status ---- */

  useEffect(() => {
    if (!sessionId || step !== "processing") return;

    const poll = setInterval(async () => {
      try {
        const s = await editStatus(sessionId);
        setProcessed(s.processed);
        setTotal(s.total);
        setAboveThreshold(s.above_threshold ?? 0);
        setBelowThreshold(s.below_threshold ?? 0);
        setCurrentImage(s.current_image);

        if (s.status === "reviewing" || s.status === "round_complete") {
          clearInterval(poll);
          if (s.above_threshold > 0) {
            setReviewTotal(s.above_threshold);
            setReviewCount(0);
            loadNext();
            setStep("review");
          } else {
            loadRoundSummary(s.current_round);
            setStep("round_complete");
          }
        } else if (s.status === "paused") {
          clearInterval(poll);
          setStep("paused");
        }
      } catch {
        /* keep polling */
      }
    }, 1500);

    pollRef.current = poll;
    return () => clearInterval(poll);
  }, [sessionId, step]);

  /* ---- Review helpers ---- */

  const loadNext = useCallback(async () => {
    if (!sessionId) return;
    setFeedback(null);
    try {
      const item = await editQueueNext(sessionId);
      setCurrent(item);
    } catch {
      setCurrent(null);
      loadRoundSummary(currentRound);
      setStep("round_complete");
    }
  }, [sessionId, currentRound]);

  const loadRoundSummary = useCallback(
    async (roundNum: number) => {
      if (!sessionId) return;
      try {
        const summary = await editRoundSummary(sessionId, roundNum);
        setRoundSummary(summary);
      } catch {
        /* ignore */
      }
    },
    [sessionId],
  );

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
      setReviewCount((c) => c + 1);
      setTimeout(() => loadNext(), 800);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }, [sessionId, current, busy, loadNext]);

  const handleReject = useCallback(async () => {
    if (!sessionId || !current || busy) return;
    setBusy(true);
    try {
      await editReject(sessionId, current.image_id);
      setFeedback("Skipped");
      setReviewCount((c) => c + 1);
      setTimeout(() => loadNext(), 500);
    } finally {
      setBusy(false);
    }
  }, [sessionId, current, busy, loadNext]);

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
        setReviewCount((c) => c + 1);
        setTimeout(() => loadNext(), 800);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "Geocoding failed");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, current, busy, loadNext],
  );

  const handlePause = useCallback(async () => {
    if (sessionId) {
      await editPause(sessionId);
      setStep("paused");
    }
  }, [sessionId]);

  const handleResume = useCallback(async () => {
    if (sessionId) {
      await editResume(sessionId);
      setStep("processing");
    }
  }, [sessionId]);

  /* ---- Session-level actions ---- */

  const handleRollbackAll = useCallback(async () => {
    if (!sessionId || !confirm("Undo ALL GPS writes from this session?"))
      return;
    const result = await editRollbackAll(sessionId);
    alert(`Rolled back ${result.rolled_back} images.`);
  }, [sessionId]);

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

  const resetSession = useCallback(() => {
    setStep("config");
    setSession(null);
    setSessionId(null);
    setRoundInfo(null);
    setRoundSummary(null);
    setCurrent(null);
    setError(null);
    setFeedback(null);
    setCurrentRound(0);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl shadow-sm animate-slide-down">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ============ STEP: CONFIG ============ */}
      {step === "config" && (
        <div className="animate-fade-in space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Add GPS to Your Photos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Predict locations for photos without GPS coordinates using AI and
              temporal context from nearby photos.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                How it works
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StepExplainer
                  num={1}
                  title="Analyze"
                  desc="We predict a location for each photo without GPS, using the AI model and temporal proximity to nearby GPS-tagged photos."
                />
                <StepExplainer
                  num={2}
                  title="Review"
                  desc="You review each prediction above your confidence threshold and decide to accept or decline it."
                />
                <StepExplainer
                  num={3}
                  title="Iterate"
                  desc="Accepted locations become reference points for the next round, helping predict photos that couldn't be located before."
                />
              </div>
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Photo directory
                </label>
                <input
                  type="text"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="Leave empty to scan all photos"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confidence threshold
                  <span className="ml-2 text-gray-400 font-normal">
                    ({(threshold * 100).toFixed(0)}%)
                  </span>
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>10% — more predictions, lower quality</span>
                  <span>90% — fewer predictions, higher quality</span>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includePredicted}
                  onChange={(e) => setIncludePredicted(e.target.checked)}
                  className="mt-0.5 accent-indigo-500"
                />
                <div>
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                    Re-process photos with predicted GPS
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Off by default. Enable to re-analyze photos that already
                    have AI-predicted coordinates (e.g. to try with a better
                    model). Real GPS is never touched.
                  </p>
                </div>
              </label>
            </div>

            <button
              onClick={handleStart}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:shadow-indigo-200 active:scale-[0.99]"
            >
              Scan & Start Session
            </button>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Safety guarantee:</strong> Photos with real GPS
              coordinates from your camera are never modified. Only photos
              without any GPS data (or with previously predicted GPS, if the
              toggle above is on) will be processed. All writes create a backup
              file that can be rolled back.
            </p>
          </div>
        </div>
      )}

      {/* ============ STEP: SCANNED ============ */}
      {step === "scanned" && session && (
        <div className="animate-fade-in-up space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Round 1 — Ready to Analyze
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Your photo library has been scanned
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <StatBox
                value={session.real_gps_count}
                label="Real GPS"
                sub="Protected — never touched"
                color="text-emerald-600"
              />
              <StatBox
                value={session.no_gps_count}
                label="No GPS"
                sub="Ready to analyze"
                color="text-blue-600"
              />
              <StatBox
                value={session.predicted_gps_count}
                label="Predicted GPS"
                sub={
                  includePredicted
                    ? "Will be re-processed"
                    : "Skipped (toggle off)"
                }
                color="text-gray-500"
              />
            </div>

            {session.disagreements > 0 && (
              <p className="text-xs text-yellow-600 mt-3">
                {session.disagreements} image(s) skipped due to ambiguous GPS
                metadata
              </p>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              The AI will analyze <strong>{session.no_gps_count} photos</strong>{" "}
              without GPS and use the{" "}
              <strong>{session.real_gps_count} GPS-tagged photos</strong> as
              temporal context. Photos taken close in time to GPS-tagged photos
              receive a confidence boost.
            </p>
          </div>

          <button
            onClick={handleStartRound}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md hover:shadow-indigo-200"
          >
            Start Analysis (
            {session.no_gps_count +
              (includePredicted ? session.predicted_gps_count : 0)}{" "}
            images)
          </button>
        </div>
      )}

      {/* ============ STEP: PROCESSING ============ */}
      {step === "processing" && (
        <div className="animate-fade-in space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Round {currentRound} — Analyzing
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {currentRound > 1
                ? `Using ${roundInfo?.reference_gps ?? 0} reference photos (including your accepted predictions)`
                : `Using ${roundInfo?.reference_gps ?? 0} GPS-tagged photos as context`}
            </p>
          </div>

          <ProgressBar
            done={processed}
            total={total}
            currentItem={currentImage}
            label="Analyzing"
          />

          {(aboveThreshold > 0 || belowThreshold > 0) && (
            <div className="flex gap-3 justify-center text-xs">
              <span className="text-emerald-600">
                {aboveThreshold} above threshold
              </span>
              <span className="text-gray-400">
                {belowThreshold} below threshold
              </span>
            </div>
          )}

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

      {/* ============ STEP: PAUSED ============ */}
      {step === "paused" && (
        <div className="bg-white border border-yellow-300 shadow-sm rounded-2xl p-5 flex items-center justify-between animate-fade-in">
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

      {/* ============ STEP: REVIEW ============ */}
      {step === "review" && current && (
        <div className="animate-fade-in-up space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Round {currentRound} — Review Predictions
            </h2>
            <span className="text-xs text-gray-400">
              {reviewCount + 1} of {reviewTotal}
            </span>
          </div>

          {current.temporal_source && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl px-3 py-2">
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                <strong>Temporal context:</strong>{" "}
                {current.temporal_source === "burst"
                  ? "A GPS-tagged photo was taken within 5 minutes of this one — high confidence."
                  : current.temporal_source === "same_day"
                    ? "A GPS-tagged photo was taken on the same day."
                    : current.temporal_source === "interpolation"
                      ? "GPS-tagged photos exist before and after this one — location interpolated."
                      : current.temporal_source === "filename_sequence"
                        ? "Sequential filename match with a GPS-tagged photo in the same folder."
                        : `Context source: ${current.temporal_source}`}{" "}
                Score: {(current.combined_score * 100).toFixed(0)}%
              </p>
            </div>
          )}

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

      {/* ============ STEP: ROUND COMPLETE ============ */}
      {step === "round_complete" && (
        <div className="animate-fade-in-up space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Round {currentRound} Complete
            </h2>
          </div>

          {roundSummary && (
            <>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <StatBox
                    value={roundSummary.accepted}
                    label="Accepted"
                    sub="GPS written"
                    color="text-emerald-600"
                  />
                  <StatBox
                    value={roundSummary.rejected}
                    label="Declined"
                    color="text-gray-500"
                  />
                  <StatBox
                    value={roundSummary.auto_skipped}
                    label="Auto-skipped"
                    sub="Below threshold"
                    color="text-gray-400"
                  />
                </div>
              </div>

              {roundSummary.remaining_unlocated > 0 && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4 space-y-2">
                  <p className="text-sm font-medium text-blue-800">
                    Why another round helps
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    You just accepted{" "}
                    <strong>{roundSummary.accepted} new GPS locations</strong>.
                    Photos taken close in time to these newly-located photos may
                    now be predictable. For example, if you accepted a photo
                    from 14:02 and there's an unlocated photo from 14:04, it can
                    now use the accepted location as context — potentially
                    pushing it above the confidence threshold.
                  </p>
                  <p className="text-xs text-blue-600 font-medium">
                    {roundSummary.remaining_unlocated} photos still without GPS.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                {roundSummary.remaining_unlocated > 0 &&
                  roundSummary.accepted > 0 && (
                    <button
                      onClick={handleStartRound}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md"
                    >
                      Start Round {currentRound + 1}
                    </button>
                  )}
                <button
                  onClick={() => setStep("session_complete")}
                  className={`${roundSummary.remaining_unlocated > 0 && roundSummary.accepted > 0 ? "flex-1" : "w-full"} py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors`}
                >
                  Finish Session
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ STEP: SESSION COMPLETE ============ */}
      {step === "session_complete" && (
        <div className="animate-fade-in-up space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Session Complete
            </h2>
            <p className="text-sm text-gray-500">
              {currentRound > 0
                ? `Completed ${currentRound} round${currentRound > 1 ? "s" : ""} of analysis`
                : "No photos to process"}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex gap-2">
              <button
                onClick={handleRollbackAll}
                className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-xl transition-colors border border-red-200"
              >
                Rollback All
              </button>
              <button
                onClick={handleCleanup}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors"
              >
                Clean Up Backups
              </button>
            </div>
            <button
              onClick={resetSession}
              className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors"
            >
              Start New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Helper components ---- */

function StepExplainer({
  num,
  title,
  desc,
}: {
  num: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mx-auto mb-2">
        {num}
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
        {title}
      </p>
      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

function StatBox({
  value,
  label,
  sub,
  color,
}: {
  value: number;
  label: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
      <p
        className={`text-2xl font-bold tabular-nums ${color || "text-gray-900"}`}
      >
        {value}
      </p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
