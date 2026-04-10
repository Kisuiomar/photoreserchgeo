import { useCallback, useEffect, useState } from "react";

import {
  compareSnapshots,
  listSnapshots,
  saveSnapshot as apiSave,
} from "../../api";
import type { ComparisonResult, SnapshotMeta } from "../../types";

interface Props {
  scanId: string | null;
  hasResults: boolean;
}

export default function SnapshotPanel({ scanId, hasResults }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [snapName, setSnapName] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshots(await listSnapshots());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    if (!scanId) return;
    setSaving(true);
    try {
      await apiSave(scanId, snapName || scanId);
      setSnapName("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [scanId, snapName, refresh]);

  const handleCompare = useCallback(async () => {
    if (!compareA || !compareB) return;
    setCompareError(null);
    try {
      const result = await compareSnapshots(compareA, compareB);
      setComparison(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Comparison failed");
    }
  }, [compareA, compareB]);

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Snapshots</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Save scan results to compare changes over time
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* ---- save ---- */}
        {hasResults && scanId && (
          <div className="flex gap-2">
            <input
              type="text"
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
              placeholder="Snapshot name (optional)"
              className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-xs font-medium rounded-xl transition-colors"
            >
              {saving ? "Saving…" : "Save Snapshot"}
            </button>
          </div>
        )}

        {/* ---- list ---- */}
        {snapshots.length > 0 && (
          <div>
            <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
              Saved Snapshots
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {snapshots.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between bg-gray-50 rounded-2xl px-3 py-2"
                >
                  <div>
                    <p className="text-xs text-gray-800">{s.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(s.created_at).toLocaleString()} —{" "}
                      {s.total_images} images, {s.with_gps} GPS
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- compare ---- */}
        {snapshots.length >= 2 && (
          <div>
            <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
              Compare Snapshots
            </h4>
            <div className="flex gap-2 items-end">
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none"
              >
                <option value="">Before…</option>
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="text-gray-400 text-xs">vs</span>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none"
              >
                <option value="">After…</option>
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCompare}
                disabled={!compareA || !compareB || compareA === compareB}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-xs font-medium rounded-xl transition-colors"
              >
                Compare
              </button>
            </div>
            {compareError && (
              <p className="text-xs text-red-500 mt-2">{compareError}</p>
            )}
          </div>
        )}

        {/* ---- comparison results ---- */}
        {comparison && <ComparisonView data={comparison} />}
      </div>
    </div>
  );
}

function ComparisonView({ data }: { data: ComparisonResult }) {
  const s = data.summary;
  const hasWarning = s.gps_removed > 0 || s.gps_changed > 0;

  return (
    <div className="space-y-3">
      {hasWarning && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm font-medium text-red-600">
            WARNING: GPS data was removed or changed
          </p>
          <p className="text-xs text-red-500 mt-1">
            This is unexpected. Review the details below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <DiffStat label="Images Added" value={s.images_added} />
        <DiffStat label="Images Removed" value={s.images_removed} />
        <DiffStat
          label="GPS Added"
          value={s.gps_added}
          color="text-emerald-600"
        />
        <DiffStat
          label="GPS Removed"
          value={s.gps_removed}
          color={s.gps_removed > 0 ? "text-red-500" : undefined}
        />
        <DiffStat
          label="GPS Changed"
          value={s.gps_changed}
          color={s.gps_changed > 0 ? "text-orange-500" : undefined}
        />
        <DiffStat
          label="Estimated Added"
          value={s.estimated_added}
          color="text-blue-600"
        />
      </div>

      {data.warnings.map((w, i) => (
        <p key={i} className="text-xs text-red-500">
          {w}
        </p>
      ))}

      {data.gps_added.length > 0 && (
        <ExpandableList
          title={`GPS Added (${data.gps_added.length})`}
          items={data.gps_added.map((g) => g.path)}
        />
      )}
      {data.gps_removed.length > 0 && (
        <ExpandableList
          title={`GPS Removed (${data.gps_removed.length})`}
          items={data.gps_removed.map((g) => g.path)}
          warn
        />
      )}
    </div>
  );
}

function DiffStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 text-center">
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p
        className={`text-sm font-bold tabular-nums ${color || "text-gray-800"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ExpandableList({
  title,
  items,
  warn,
}: {
  title: string;
  items: string[];
  warn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs ${warn ? "text-red-500" : "text-gray-500"} hover:text-gray-900 transition-colors`}
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
          {items.map((p) => (
            <li
              key={p}
              className="text-[10px] text-gray-400 truncate"
              title={p}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
