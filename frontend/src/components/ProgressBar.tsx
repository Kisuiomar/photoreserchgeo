import { useEffect, useRef, useState } from "react";

function formatEta(seconds: number): string {
  if (seconds < 1) return "finishing...";
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  if (m < 60) return `~${m}m ${s}s remaining`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `~${h}h ${rm}m remaining`;
}

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

  useEffect(() => {
    if (done === 0) {
      startRef.current = Date.now();
      setEta(null);
    }
  }, [total, done === 0]);

  useEffect(() => {
    if (done <= 0 || done >= total) {
      setEta(null);
      return;
    }
    const elapsed = (Date.now() - startRef.current) / 1000;
    const avgPerItem = elapsed / done;
    const remaining = (total - done) * avgPerItem;
    setEta(formatEta(remaining));
  }, [done, total]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <span className="text-sm text-gray-700 truncate">
            {label}
            {currentItem ? `: ${currentItem}` : "..."}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0 ml-3">
          {done} / {total}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out animate-progress-glow"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{eta || "\u00A0"}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
