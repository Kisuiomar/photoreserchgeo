import { useEffect, useRef, useState } from "react";

import type { ScanStatus } from "../../types";

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
  directory: string;
  onDirectoryChange: (v: string) => void;
  onScan: () => void;
  scanning: boolean;
  status: ScanStatus | null;
}

export default function ScanControls({
  directory,
  onDirectoryChange,
  onScan,
  scanning,
  status,
}: Props) {
  const pct =
    status && status.total > 0
      ? Math.round((status.processed / status.total) * 100)
      : 0;

  const startRef = useRef<number>(Date.now());
  const [eta, setEta] = useState<string | null>(null);

  // Reset timer when scan starts
  useEffect(() => {
    if (status?.status === "scanning" && status.processed === 0) {
      startRef.current = Date.now();
      setEta(null);
    }
  }, [status?.status, status?.processed === 0]);

  // Compute ETA
  useEffect(() => {
    if (
      !status ||
      status.status !== "scanning" ||
      status.processed <= 0 ||
      status.total <= 0
    ) {
      setEta(null);
      return;
    }
    const elapsed = (Date.now() - startRef.current) / 1000;
    const avgPer = elapsed / status.processed;
    const remaining = (status.total - status.processed) * avgPer;
    setEta(formatEta(remaining));
  }, [status?.processed, status?.total, status?.status]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input
          type="text"
          value={directory}
          onChange={(e) => onDirectoryChange(e.target.value)}
          placeholder="Directory path (leave empty to scan all)"
          disabled={scanning}
          className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-indigo-500 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={onScan}
          disabled={scanning}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
        >
          {scanning ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Scanning…
            </>
          ) : (
            "Scan"
          )}
        </button>
      </div>

      {status && status.status === "scanning" && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Scanning images…</span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {status.processed.toLocaleString()} /{" "}
              {status.total.toLocaleString()}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{eta || "\u00A0"}</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {status && status.status === "complete" && (
        <p className="text-xs text-emerald-600">
          Scan complete · {status.total.toLocaleString()} images processed
        </p>
      )}

      {status && status.status === "error" && (
        <p className="text-xs text-red-500">Scan failed: {status.error}</p>
      )}
    </div>
  );
}
