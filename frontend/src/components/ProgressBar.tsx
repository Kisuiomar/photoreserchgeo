import { useEffect, useRef, useState } from "react";

interface Props {
  done: number;
  total: number;
  currentItem?: string | null;
  label?: string;
}

export default function ProgressBar({
  done,
  total,
  currentItem,
  label = "Processing",
}: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const startRef = useRef<number>(Date.now());
  const [eta, setEta] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const lastCalcRef = useRef<{ done: number; eta: number; at: number } | null>(
    null,
  );

  // Reset start time when a new batch begins
  useEffect(() => {
    if (done === 0) {
      startRef.current = Date.now();
      setEta(null);
      setCountdown(null);
      lastCalcRef.current = null;
    }
  }, [total, done === 0]);

  // Recalculate ETA whenever done changes
  useEffect(() => {
    if (done <= 0 || done >= total) {
      setEta(null);
      setCountdown(null);
      lastCalcRef.current = null;
      return;
    }
    const elapsed = (Date.now() - startRef.current) / 1000;
    const avgPerItem = elapsed / done;
    const remaining = (total - done) * avgPerItem;
    lastCalcRef.current = { done, eta: remaining, at: Date.now() };
    setCountdown(remaining);
  }, [done, total]);

  // Smooth countdown every second
  useEffect(() => {
    if (countdown === null || done >= total) return;
    const interval = setInterval(() => {
      if (!lastCalcRef.current) return;
      const elapsed = (Date.now() - lastCalcRef.current.at) / 1000;
      const remaining = Math.max(0, lastCalcRef.current.eta - elapsed);
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown !== null, done, total]);

  // Format countdown
  useEffect(() => {
    if (countdown === null) {
      setEta(null);
      return;
    }
    if (countdown < 1) {
      setEta("finishing...");
    } else if (countdown < 60) {
      setEta(`~${Math.ceil(countdown)}s remaining`);
    } else if (countdown < 3600) {
      const m = Math.floor(countdown / 60);
      const s = Math.ceil(countdown % 60);
      setEta(`~${m}m ${s}s remaining`);
    } else {
      const h = Math.floor(countdown / 3600);
      const rm = Math.floor((countdown % 3600) / 60);
      setEta(`~${h}h ${rm}m remaining`);
    }
  }, [countdown]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-4 h-4 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {label}
            {currentItem ? `: ${currentItem}` : "..."}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums flex-shrink-0 ml-3">
          {done} / {total}
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out animate-progress-glow"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{eta || "\u00A0"}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
