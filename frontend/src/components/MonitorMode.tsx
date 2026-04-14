import { useCallback, useEffect, useRef, useState } from "react";

import { getScanResults, getScanStatus, startScan } from "../api";
import type { ScanResults, ScanStatus } from "../types";
import ScanControls from "./monitor/ScanControls";
import ScanMap from "./monitor/ScanMap";
import ScanStats from "./monitor/ScanStats";

export default function MonitorMode() {
  const [directory, setDirectory] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleScan = useCallback(async () => {
    setError(null);
    try {
      const { scan_id } = await startScan(directory);
      setScanId(scan_id);
      setStatus({
        scan_id,
        status: "scanning",
        directory,
        total: 0,
        processed: 0,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      });
      setResults(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
    }
  }, [directory]);

  useEffect(() => {
    if (!scanId || !status || status.status !== "scanning") return;

    const poll = setInterval(async () => {
      try {
        const s = await getScanStatus(scanId);
        setStatus(s);
        if (s.status === "complete") {
          clearInterval(poll);
          const r = await getScanResults(scanId);
          setResults(r);
        } else if (s.status === "error") {
          clearInterval(poll);
        }
      } catch {
        /* keep polling */
      }
    }, 1000);

    pollRef.current = poll;
    return () => clearInterval(poll);
  }, [scanId, status?.status]);

  const handleExport = useCallback(() => {
    if (!results) return;
    const header =
      "filename,path,has_gps,is_estimated,lat,lon,sources,format,file_size,date_taken\n";
    const rows = results.images
      .map((img) => {
        const lat = img.coordinates?.lat ?? "";
        const lon = img.coordinates?.lon ?? "";
        const sources = (img.sources || []).join(";");
        return `"${img.filename}","${img.relative_path}",${img.has_gps},${img.is_estimated},${lat},${lon},"${sources}",${img.format},${img.file_size},"${img.date_taken || ""}"`;
      })
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `library-scan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const scanning = status?.status === "scanning";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl shadow-sm animate-slide-down">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!results && !scanning && (
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Library Overview
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Scan your photo library to see GPS coverage, format breakdown, and
            where your photos were taken on a world map. Read-only, nothing is
            modified.
          </p>
        </div>
      )}

      <ScanControls
        directory={directory}
        onDirectoryChange={setDirectory}
        onScan={handleScan}
        scanning={!!scanning}
        status={status}
      />

      {results && (
        <>
          <ScanStats results={results} onExport={handleExport} />
          <ScanMap gpsImages={results.gps_images} />
        </>
      )}
    </div>
  );
}
