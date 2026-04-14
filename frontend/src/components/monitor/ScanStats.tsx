import { useMemo, useState } from "react";

import type { ScanResults } from "../../types";
import HelpTip from "../HelpTip";

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

interface Props {
  results: ScanResults;
  onExport: () => void;
}

export default function ScanStats({ results, onExport }: Props) {
  const [dirOpen, setDirOpen] = useState(false);
  const t = results.total_images;
  const realGps = results.with_gps - results.with_estimated_gps;

  const formatEntries = useMemo(
    () => Object.entries(results.by_format).sort(([, a], [, b]) => b - a),
    [results.by_format],
  );

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Library Statistics
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t.toLocaleString()} images scanned
          </p>
        </div>
        <button
          onClick={onExport}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* ---- summary cards ---- */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBox
            label="Total"
            value={t}
            help="Total images found in the scanned directory."
          />
          <StatBox
            label="Real GPS"
            value={realGps}
            sub={pct(realGps, t)}
            color="text-emerald-600 dark:text-emerald-400"
            help="Photos with authentic GPS coordinates from the camera or phone that took them. These are never touched by the editor."
          />
          <StatBox
            label="Estimated"
            value={results.with_estimated_gps}
            sub={pct(results.with_estimated_gps, t)}
            color="text-blue-600 dark:text-blue-400"
            help="Photos where GPS was written later (e.g. by this app) and marked as ESTIMATED in the EXIF metadata. Distinguishable from real GPS."
          />
          <StatBox
            label="No GPS"
            value={results.without_gps}
            sub={pct(results.without_gps, t)}
            color="text-gray-600 dark:text-gray-300"
            help="Photos with no GPS metadata at all. Candidates for AI-based location prediction in the Edit mode."
          />
          <StatBox
            label="Null Island"
            value={results.null_island}
            sub={pct(results.null_island, t)}
            color="text-yellow-600 dark:text-yellow-400"
            help="Photos with GPS coordinates of exactly (0, 0), a location in the Atlantic Ocean off the African coast. Almost always a bug or broken sensor, not a real location. Named after the fact that this point is in the ocean where no land exists."
          />
          <StatBox
            label="Errors"
            value={results.errors}
            sub={pct(results.errors, t)}
            color="text-red-500 dark:text-red-400"
            help="Files that could not be read or parsed (corrupt, unsupported format, permission issues)."
          />
        </div>

        {/* ---- stacked bar ---- */}
        {t > 0 && (
          <div>
            <div className="h-3 flex rounded-full overflow-hidden bg-gray-100">
              {realGps > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(realGps / t) * 100}%` }}
                />
              )}
              {results.with_estimated_gps > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{
                    width: `${(results.with_estimated_gps / t) * 100}%`,
                  }}
                />
              )}
              {results.null_island > 0 && (
                <div
                  className="bg-yellow-500 transition-all"
                  style={{ width: `${(results.null_island / t) * 100}%` }}
                />
              )}
              {results.without_gps > 0 && (
                <div
                  className="bg-gray-400 transition-all"
                  style={{ width: `${(results.without_gps / t) * 100}%` }}
                />
              )}
              {results.errors > 0 && (
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${(results.errors / t) * 100}%` }}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px]">
              <Legend color="bg-emerald-500" label="Real GPS" />
              <Legend color="bg-blue-500" label="Estimated" />
              <Legend color="bg-yellow-500" label="Null Island" />
              <Legend color="bg-gray-400" label="No GPS" />
              {results.errors > 0 && (
                <Legend color="bg-red-500" label="Errors" />
              )}
            </div>
          </div>
        )}

        {/* ---- format chips ---- */}
        {formatEntries.length > 0 && (
          <div>
            <h4 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              File Formats
            </h4>
            <div className="flex flex-wrap gap-2">
              {formatEntries.map(([fmt, count]) => (
                <span
                  key={fmt}
                  className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-700"
                >
                  .{fmt}{" "}
                  <span className="text-gray-500 dark:text-gray-400">
                    {count.toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ---- per-directory breakdown ---- */}
        {results.by_directory.length > 0 && (
          <div>
            <button
              onClick={() => setDirOpen(!dirOpen)}
              className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${dirOpen ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Directories ({results.by_directory.length})
            </button>
            {dirOpen && (
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200">
                      <th className="text-left py-1.5 pr-3 font-medium">
                        Directory
                      </th>
                      <th className="text-right py-1.5 pr-3 font-medium">
                        Total
                      </th>
                      <th className="text-right py-1.5 pr-3 font-medium">
                        GPS
                      </th>
                      <th className="text-right py-1.5 font-medium">No GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.by_directory.map((d) => (
                      <tr
                        key={d.directory}
                        className="border-b border-gray-100 dark:border-gray-800"
                      >
                        <td
                          className="py-1.5 pr-3 text-gray-700 truncate max-w-[300px]"
                          title={d.directory}
                        >
                          {d.directory}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">
                          {d.total}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">
                          {d.with_gps}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                          {d.without_gps}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  color,
  help,
}: {
  label: string;
  value: number;
  sub?: string;
  color?: string;
  help?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 text-center">
      <div className="flex items-center justify-center">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
          {label}
        </p>
        {help && <HelpTip text={help} />}
      </div>
      <p
        className={`text-lg font-bold tabular-nums ${color || "text-gray-900 dark:text-gray-100"}`}
      >
        {value.toLocaleString()}
      </p>
      {sub && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400">{sub}</p>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-gray-500">
      <span className={`w-2 h-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
