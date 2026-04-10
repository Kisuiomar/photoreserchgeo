import { useMemo, useState } from "react";

import type { AnalysisResult } from "../types";

/* ---- math helpers ---- */

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(arr: number[], mean: number): number {
  const sqDiffs = arr.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

function fmtDist(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function qualityLabel(km: number): { text: string; cls: string } {
  if (km < 1) return { text: "Excellent", cls: "text-emerald-600" };
  if (km < 25) return { text: "Good", cls: "text-blue-600" };
  if (km < 200) return { text: "Fair", cls: "text-yellow-600" };
  if (km < 750) return { text: "Poor", cls: "text-orange-500" };
  return { text: "Off", cls: "text-red-500" };
}

/* ---- thresholds ---- */

const THRESHOLDS = [1, 25, 200, 750, 2500] as const;
const THRESHOLD_LABELS: Record<number, string> = {
  1: "Street (1 km)",
  25: "City (25 km)",
  200: "Region (200 km)",
  750: "Country (750 km)",
  2500: "Continent (2500 km)",
};

/* ---- histogram buckets ---- */

const BUCKETS = [
  { max: 1, label: "<1" },
  { max: 25, label: "1-25" },
  { max: 200, label: "25-200" },
  { max: 750, label: "200-750" },
  { max: 2500, label: "750-2500" },
  { max: Infinity, label: "2500+" },
] as const;

/* ---- sort types ---- */

type SortKey = "filename" | "top1" | "best" | "label";
type SortDir = "asc" | "desc";

/* ---- component ---- */

interface Props {
  results: AnalysisResult[];
  onRowClick: (id: string) => void;
}

export default function StatsPanel({ results, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("top1");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const benchmarked = useMemo(
    () => results.filter((r) => r.benchmark != null),
    [results],
  );

  const stats = useMemo(() => {
    if (benchmarked.length < 2) return null;

    const top1s = benchmarked.map((r) => r.benchmark!.top1_distance_km);
    const bests = benchmarked.map((r) => r.benchmark!.best_distance_km);
    const n = top1s.length;

    const meanTop1 = top1s.reduce((a, b) => a + b, 0) / n;
    const medianTop1 = median(top1s);
    const sdTop1 = stddev(top1s, meanTop1);
    const minTop1 = Math.min(...top1s);
    const maxTop1 = Math.max(...top1s);
    const meanBest = bests.reduce((a, b) => a + b, 0) / n;

    const pctWithin = THRESHOLDS.map(
      (t) => (top1s.filter((d) => d <= t).length / n) * 100,
    );

    const histogram = BUCKETS.map((b, i) => {
      const lo = i === 0 ? 0 : BUCKETS[i - 1].max;
      return top1s.filter((d) => d > lo && d <= b.max).length;
    });
    const histMax = Math.max(...histogram, 1);

    return {
      n,
      meanTop1,
      medianTop1,
      sdTop1,
      minTop1,
      maxTop1,
      meanBest,
      pctWithin,
      histogram,
      histMax,
    };
  }, [benchmarked]);

  const sorted = useMemo(() => {
    if (!stats) return [];
    const rows = benchmarked.map((r) => ({
      id: r.id,
      filename: r.filename,
      top1: r.benchmark!.top1_distance_km,
      best: r.benchmark!.best_distance_km,
    }));

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "filename") cmp = a.filename.localeCompare(b.filename);
      else if (sortKey === "top1") cmp = a.top1 - b.top1;
      else if (sortKey === "best") cmp = a.best - b.best;
      else cmp = a.top1 - b.top1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [benchmarked, stats, sortKey, sortDir]);

  if (!stats) return null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "filename" ? "asc" : "desc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">
          Benchmark Statistics
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Based on {stats.n} image{stats.n !== 1 ? "s" : ""} with GPS data
        </p>
      </div>

      <div className="p-5 space-y-6">
        {/* ---- core metrics ---- */}
        <div className="grid grid-cols-3 gap-4">
          {/* hero: median */}
          <div className="col-span-3 sm:col-span-1 bg-gray-50 rounded-2xl p-4 text-center">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
              Median Top-1
            </p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {fmtDist(stats.medianTop1)}
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
              Mean Top-1
            </p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">
              {fmtDist(stats.meanTop1)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              \u00B1 {fmtDist(stats.sdTop1)} SD
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
              Mean Best-Match
            </p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">
              {fmtDist(stats.meanBest)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {fmtDist(stats.minTop1)} — {fmtDist(stats.maxTop1)} range
            </p>
          </div>
        </div>

        {/* ---- accuracy thresholds ---- */}
        <section>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Accuracy Thresholds
          </h4>
          <div className="space-y-1.5">
            {THRESHOLDS.map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 flex-shrink-0">
                  {THRESHOLD_LABELS[t]}
                </span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${stats.pctWithin[i]}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-800 tabular-nums w-12 text-right">
                  {stats.pctWithin[i].toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- histogram ---- */}
        <section>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Distance Distribution (km)
          </h4>
          <div className="flex items-end gap-1.5 h-24">
            {BUCKETS.map((b, i) => {
              const count = stats.histogram[i];
              const h = stats.histMax > 0 ? (count / stats.histMax) * 100 : 0;
              return (
                <div
                  key={b.label}
                  className="flex-1 flex flex-col items-center"
                >
                  <span className="text-[9px] text-gray-500 tabular-nums mb-0.5">
                    {count || ""}
                  </span>
                  <div className="w-full flex items-end" style={{ height: 64 }}>
                    <div
                      className="w-full bg-blue-500/70 rounded-t transition-all"
                      style={{ height: `${Math.max(h, count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- sortable per-image list ---- */}
        <section>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Per-Image Summary
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-200">
                  <th
                    className="text-left py-1.5 pr-3 font-medium cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort("filename")}
                  >
                    File{arrow("filename")}
                  </th>
                  <th
                    className="text-right py-1.5 pr-3 font-medium cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort("top1")}
                  >
                    Top-1{arrow("top1")}
                  </th>
                  <th
                    className="text-right py-1.5 pr-3 font-medium cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort("best")}
                  >
                    Best{arrow("best")}
                  </th>
                  <th className="text-right py-1.5 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const q = qualityLabel(row.top1);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick(row.id)}
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-1.5 pr-3 text-gray-700 truncate max-w-[180px]">
                        {row.filename}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800">
                        {fmtDist(row.top1)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">
                        {fmtDist(row.best)}
                      </td>
                      <td className={`py-1.5 text-right font-medium ${q.cls}`}>
                        {q.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
