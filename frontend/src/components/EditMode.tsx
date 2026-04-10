import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  editAccept,
  editApply,
  editCleanupBackups,
  editInfo,
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
import HelpTip from "./HelpTip";
import PrivacyNote from "./PrivacyNote";
import ProgressBar from "./ProgressBar";
import ReviewCard from "./edit/ReviewCard";
import Switch from "./Switch";

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

interface PersistedState {
  sessionId: string | null;
  step: Step;
  directory: string;
  useThreshold: boolean;
  threshold: number;
  includePredicted: boolean;
  currentRound: number;
}

const STORAGE_KEY = "edit_session_v2";

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    sessionId: null,
    step: "config",
    directory: "",
    useThreshold: false,
    threshold: 0.3,
    includePredicted: false,
    currentRound: 0,
  };
}

function savePersisted(state: Partial<PersistedState>) {
  try {
    const current = loadPersisted();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...state }));
  } catch {
    /* ignore */
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function EditMode() {
  const initialState = loadPersisted();
  const [step, setStep] = useState<Step>(initialState.step);
  const [directory, setDirectory] = useState(initialState.directory);
  const [useThreshold, setUseThreshold] = useState(initialState.useThreshold);
  const [threshold, setThreshold] = useState(initialState.threshold);
  const [includePredicted, setIncludePredicted] = useState(
    initialState.includePredicted,
  );

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    initialState.sessionId,
  );
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);

  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [aboveThreshold, setAboveThreshold] = useState(0);
  const [belowThreshold, setBelowThreshold] = useState(0);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(initialState.currentRound);

  const [current, setCurrent] = useState<CurrentReview | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(!!initialState.sessionId);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Persist state changes ---- */
  useEffect(() => {
    savePersisted({
      sessionId,
      step,
      directory,
      useThreshold,
      threshold,
      includePredicted,
      currentRound,
    });
  }, [
    sessionId,
    step,
    directory,
    useThreshold,
    threshold,
    includePredicted,
    currentRound,
  ]);

  /* ---- Restore session on mount ---- */
  useEffect(() => {
    if (!initialState.sessionId) return;

    (async () => {
      try {
        const info = await editInfo(initialState.sessionId!);
        setSession({
          session_id: info.session_id,
          total_images: info.total_images,
          real_gps_count: info.real_gps_count,
          predicted_gps_count: info.predicted_gps_count,
          no_gps_count: info.no_gps_count,
          disagreements: 0,
          warnings: [],
        });
        setCurrentRound(info.current_round);

        // Derive step from backend state
        if (info.status === "complete") {
          setStep("session_complete");
        } else if (info.status === "processing") {
          setStep("processing");
        } else if (
          info.status === "reviewing" ||
          info.round_pending_review > 0
        ) {
          setReviewTotal(info.round_above_threshold);
          try {
            const item = await editQueueNext(info.session_id);
            setCurrent(item);
            setStep("review");
          } catch {
            setStep("round_complete");
            loadRoundSummary(info.current_round);
          }
        } else if (info.status === "round_complete") {
          setStep("round_complete");
          loadRoundSummary(info.current_round);
        } else if (info.current_round === 0) {
          setStep("scanned");
        } else {
          setStep("scanned");
        }
      } catch {
        // Session not found on backend — reset
        clearPersisted();
        setSessionId(null);
        setStep("config");
      } finally {
        setRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Step 1: Start session (scan) ---- */
  const handleStart = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const effectiveThreshold = useThreshold ? threshold : 0;
      const info = await editStart(
        directory,
        effectiveThreshold,
        includePredicted,
      );
      setSession(info);
      setSessionId(info.session_id);
      setStep("scanned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setBusy(false);
    }
  }, [directory, threshold, useThreshold, includePredicted, busy]);

  /* ---- Step 2: Start a round ---- */
  const handleStartRound = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy]);

  /* ---- Poll inference status ---- */
  useEffect(() => {
    if (!sessionId || step !== "processing") return;

    let mounted = true;
    const poll = setInterval(async () => {
      if (!mounted) return;
      try {
        const s = await editStatus(sessionId);
        if (!mounted) return;
        setProcessed(s.processed);
        setTotal(s.total);
        setAboveThreshold(s.above_threshold ?? 0);
        setBelowThreshold(s.below_threshold ?? 0);
        setCurrentImage(s.current_image);

        if (
          s.status === "reviewing" ||
          s.status === "round_complete" ||
          s.status === "complete"
        ) {
          clearInterval(poll);
          if ((s.above_threshold ?? 0) > 0) {
            setReviewTotal(s.above_threshold);
            setReviewCount(0);
            await loadNextSafe(sessionId);
            setStep("review");
          } else {
            await loadRoundSummarySafe(sessionId, s.current_round);
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
    return () => {
      mounted = false;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, step]);

  /* ---- Safe helpers ---- */
  const loadNextSafe = useCallback(async (sid: string) => {
    try {
      const item = await editQueueNext(sid);
      setCurrent(item);
      setFeedback(null);
    } catch {
      setCurrent(null);
    }
  }, []);

  const loadRoundSummarySafe = useCallback(
    async (sid: string, roundNum: number) => {
      try {
        const summary = await editRoundSummary(sid, roundNum);
        setRoundSummary(summary);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const loadNext = useCallback(async () => {
    if (!sessionId) return;
    try {
      const item = await editQueueNext(sessionId);
      setCurrent(item);
      setFeedback(null);
    } catch {
      setCurrent(null);
      await loadRoundSummarySafe(sessionId, currentRound);
      setStep("round_complete");
    }
  }, [sessionId, currentRound, loadRoundSummarySafe]);

  const loadRoundSummary = useCallback(
    async (roundNum: number) => {
      if (!sessionId) return;
      await loadRoundSummarySafe(sessionId, roundNum);
    },
    [sessionId, loadRoundSummarySafe],
  );

  /* ---- Review actions ---- */
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
      setTimeout(() => loadNext(), 600);
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
      setTimeout(() => loadNext(), 400);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed");
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
        setTimeout(() => loadNext(), 600);
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
      try {
        await editPause(sessionId);
      } catch {
        /* ignore */
      }
      setStep("paused");
    }
  }, [sessionId]);

  const handleResume = useCallback(async () => {
    if (sessionId) {
      try {
        await editResume(sessionId);
      } catch {
        /* ignore */
      }
      setStep("processing");
    }
  }, [sessionId]);

  /* ---- Session-level actions ---- */
  const handleRollbackAll = useCallback(async () => {
    if (!sessionId || !confirm("Undo ALL GPS writes from this session?"))
      return;
    try {
      const result = await editRollbackAll(sessionId);
      alert(`Rolled back ${result.rolled_back} images.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rollback failed");
    }
  }, [sessionId]);

  const handleCleanup = useCallback(async () => {
    if (
      !sessionId ||
      !confirm(
        "This permanently removes backup files. You will NOT be able to undo GPS changes. Continue?",
      )
    )
      return;
    try {
      const result = await editCleanupBackups(sessionId);
      alert(`Cleaned up ${result.cleaned} backup files.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [sessionId]);

  const resetSession = useCallback(() => {
    clearPersisted();
    setStep("config");
    setSession(null);
    setSessionId(null);
    setRoundInfo(null);
    setRoundSummary(null);
    setCurrent(null);
    setError(null);
    setFeedback(null);
    setCurrentRound(0);
    setDirectory("");
    setUseThreshold(false);
    setThreshold(0.3);
    setIncludePredicted(false);
  }, []);

  if (restoring) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-3">
          Restoring your session…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl shadow-sm animate-slide-down flex items-center justify-between">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ============ STEP: CONFIG ============ */}
        {step === "config" && (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Add GPS to Your Photos
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Predict locations for photos without GPS coordinates using AI
                and temporal context from nearby photos.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
                  How it works
                  <HelpTip
                    width={320}
                    text="Edit mode runs in rounds. Each round predicts locations for photos without GPS, lets you review and accept/decline each prediction, and then uses your accepted locations as new reference points for the next round. A photo taken 2 minutes after an accepted photo becomes very easy to predict."
                  />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <StepExplainer
                    num={1}
                    title="Analyze"
                    desc="AI predicts a location for every photo without GPS, boosted by temporal proximity to existing GPS-tagged photos."
                  />
                  <StepExplainer
                    num={2}
                    title="Review"
                    desc="You decide for each photo: accept the prediction, reject it, or enter a manual address."
                  />
                  <StepExplainer
                    num={3}
                    title="Iterate"
                    desc="Accepted locations become new reference points. Run another round to locate photos that weren't confident enough before."
                  />
                </div>
              </div>

              <hr className="border-gray-100 dark:border-gray-800" />

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center">
                    Photo directory
                    <HelpTip text="Path relative to your configured photo library. Leave empty to scan the entire library. Sub-directories are searched recursively." />
                  </label>
                  <input
                    type="text"
                    value={directory}
                    onChange={(e) => setDirectory(e.target.value)}
                    placeholder="Leave empty to scan all photos"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-colors"
                  />
                </div>

                <Switch
                  checked={useThreshold}
                  onChange={setUseThreshold}
                  label="Filter low-confidence predictions"
                  description="Skip predictions below a threshold automatically instead of reviewing them. Not recommended — the model's confidence is often unreliable, and many good predictions have low scores. Leave this off and review every photo manually if you have time."
                  help="When off (recommended): every photo's best prediction is shown for your review. When on: predictions below the threshold are auto-skipped and you never see them."
                />

                {useThreshold && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pl-13 ml-0">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center">
                        Confidence threshold
                        <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal">
                          ({(threshold * 100).toFixed(0)}%)
                        </span>
                        <HelpTip text="Combined score (model confidence + temporal context). Predictions below this are auto-declined. Lower = review more, higher = review fewer but risk missing good predictions." />
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        <span>0% — show all</span>
                        <span>100% — show almost none</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <Switch
                  checked={includePredicted}
                  onChange={setIncludePredicted}
                  label="Re-process photos with previously predicted GPS"
                  description="Off by default. When on, photos that already have AI-predicted coordinates will be re-analyzed (useful if you want to try with a better model). Real GPS data is never touched."
                  help="Real GPS coordinates from your camera are always protected. This toggle only affects photos where GPS was previously written by this app (marked as ESTIMATED in the EXIF metadata)."
                />
              </div>

              <div>
                <button
                  onClick={handleStart}
                  disabled={busy}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:shadow-indigo-200 dark:hover:shadow-indigo-900 active:scale-[0.99]"
                >
                  {busy ? "Scanning…" : "Scan & Start Session"}
                </button>
                <PrivacyNote className="mt-2" />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Safety guarantee:</strong> Photos with real GPS
                coordinates from your camera are never modified. Only photos
                without any GPS data will be processed. All writes create a
                backup file that can be rolled back at any time.
              </p>
            </div>
          </motion.div>
        )}

        {/* ============ STEP: SCANNED ============ */}
        {step === "scanned" && session && (
          <motion.div
            key="scanned"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Round 1 — Ready to Analyze
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your photo library has been scanned
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <StatBox
                  value={session.real_gps_count}
                  label="Real GPS"
                  sub="Protected"
                  color="text-emerald-600 dark:text-emerald-400"
                  help="Photos with original GPS coordinates from your camera. These are never touched."
                />
                <StatBox
                  value={session.no_gps_count}
                  label="No GPS"
                  sub="Will be analyzed"
                  color="text-blue-600 dark:text-blue-400"
                  help="Photos without any GPS metadata. These are the candidates for AI-based location prediction."
                />
                <StatBox
                  value={session.predicted_gps_count}
                  label="Predicted GPS"
                  sub={includePredicted ? "Will be re-analyzed" : "Skipped"}
                  color="text-gray-500 dark:text-gray-400"
                  help="Photos that previously received an AI-predicted location from this app. They are only re-processed if the toggle is on."
                />
              </div>
              {session.disagreements > 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-3">
                  {session.disagreements} image(s) skipped due to ambiguous GPS
                  metadata
                </p>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                The AI will analyze{" "}
                <strong>{session.no_gps_count} photos</strong> without GPS,
                using the{" "}
                <strong>{session.real_gps_count} GPS-tagged photos</strong> as
                temporal context. Photos taken close in time to GPS-tagged
                photos receive a confidence boost.
              </p>
            </div>

            <div>
              <button
                onClick={handleStartRound}
                disabled={busy}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md hover:shadow-indigo-200 dark:hover:shadow-indigo-900 active:scale-[0.99]"
              >
                {busy
                  ? "Starting…"
                  : `Start Analysis (${session.no_gps_count + (includePredicted ? session.predicted_gps_count : 0)} images)`}
              </button>
              <PrivacyNote className="mt-2" />
            </div>

            <div className="flex justify-center">
              <button
                onClick={resetSession}
                className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Cancel and start over
              </button>
            </div>
          </motion.div>
        )}

        {/* ============ STEP: PROCESSING ============ */}
        {step === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Round {currentRound} — Analyzing
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {currentRound > 1
                  ? `Using ${roundInfo?.reference_gps ?? 0} reference photos (real GPS + accepted predictions)`
                  : `Using ${roundInfo?.reference_gps ?? 0} GPS-tagged photos as context`}
              </p>
            </div>

            <ProgressBar
              done={processed}
              total={total}
              currentItem={currentImage}
              label="Analyzing"
            />

            {useThreshold && (aboveThreshold > 0 || belowThreshold > 0) && (
              <div className="flex gap-3 justify-center text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {aboveThreshold} above threshold
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                  {belowThreshold} below threshold
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <PrivacyNote />
              <button
                onClick={handlePause}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Pause
              </button>
            </div>
          </motion.div>
        )}

        {/* ============ STEP: PAUSED ============ */}
        {step === "paused" && (
          <motion.div
            key="paused"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-900 border border-yellow-300 dark:border-yellow-700 shadow-sm rounded-2xl p-5 flex items-center justify-between"
          >
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Paused — {processed}/{total} processed
            </p>
            <button
              onClick={handleResume}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
            >
              Resume
            </button>
          </motion.div>
        )}

        {/* ============ STEP: REVIEW ============ */}
        {step === "review" && current && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                Round {currentRound} — Review
                <HelpTip text="Each photo's best prediction is shown. Accept to write the GPS into the photo file, Reject to skip, or Manual to type a known address." />
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {reviewCount + 1} of {reviewTotal || "?"}
              </span>
            </div>

            {current.temporal_source && (
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl px-3 py-2">
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  <strong>Temporal context:</strong>{" "}
                  {current.temporal_source === "burst"
                    ? "A GPS-tagged photo was taken within 5 minutes of this one — very high confidence."
                    : current.temporal_source === "same_day"
                      ? "A GPS-tagged photo was taken on the same day."
                      : current.temporal_source === "interpolation"
                        ? "GPS-tagged photos exist before and after this one — location interpolated."
                        : current.temporal_source === "filename_sequence"
                          ? "Sequential filename match with a GPS-tagged photo in the same folder."
                          : `Context: ${current.temporal_source}`}{" "}
                  · Combined score: {(current.combined_score * 100).toFixed(0)}%
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
            <PrivacyNote />
          </motion.div>
        )}

        {/* ============ STEP: ROUND COMPLETE ============ */}
        {step === "round_complete" && (
          <motion.div
            key="round_complete"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
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
                      color="text-emerald-600 dark:text-emerald-400"
                    />
                    <StatBox
                      value={roundSummary.rejected}
                      label="Declined"
                      color="text-gray-500 dark:text-gray-400"
                    />
                    {roundSummary.auto_skipped > 0 && (
                      <StatBox
                        value={roundSummary.auto_skipped}
                        label="Auto-skipped"
                        sub="Below threshold"
                        color="text-gray-400 dark:text-gray-500"
                      />
                    )}
                  </div>
                </div>

                {roundSummary.remaining_unlocated > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4 space-y-2">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Why another round helps
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      You just accepted{" "}
                      <strong>{roundSummary.accepted} new GPS locations</strong>
                      . Photos taken close in time to these newly-located photos
                      may now be predictable. If you accepted a photo from 14:02
                      and there's an unlocated photo from 14:04, it can now use
                      the accepted location as context.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      {roundSummary.remaining_unlocated} photos still without
                      GPS.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  {roundSummary.remaining_unlocated > 0 &&
                    roundSummary.accepted > 0 && (
                      <button
                        onClick={handleStartRound}
                        disabled={busy}
                        className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md"
                      >
                        {busy ? "Starting…" : `Start Round ${currentRound + 1}`}
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
          </motion.div>
        )}

        {/* ============ STEP: SESSION COMPLETE ============ */}
        {step === "session_complete" && (
          <motion.div
            key="session_complete"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Session Complete
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {currentRound > 0
                  ? `Completed ${currentRound} round${currentRound > 1 ? "s" : ""} of analysis`
                  : "No photos to process"}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl p-5 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={handleRollbackAll}
                  className="flex-1 py-2.5 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl transition-colors border border-red-200 dark:border-red-800"
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
          </motion.div>
        )}
      </AnimatePresence>
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
      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center mx-auto mb-2">
        {num}
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

function StatBox({
  value,
  label,
  sub,
  color,
  help,
}: {
  value: number;
  label: string;
  sub?: string;
  color?: string;
  help?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
      <p
        className={`text-2xl font-bold tabular-nums ${color || "text-gray-900 dark:text-gray-100"}`}
      >
        {value}
      </p>
      <div className="flex items-center justify-center">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        {help && <HelpTip text={help} />}
      </div>
      {sub && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          {sub}
        </p>
      )}
    </div>
  );
}
