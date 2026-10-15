import { useState } from "react";

import type { AnalysisResult, Benchmark, ExactDetails, Prediction } from "../types";
import GoogleMapsLink from "./GoogleMapsLink";
import PredictionMap from "./PredictionMap";
import PredictionsTable from "./PredictionsTable";

function formatAddr(p: Prediction): string {
  if (!p.address) return "Unknown location";
  const parts = [p.address.city, p.address.region, p.address.country].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

function consensus(preds: Prediction[]): string | null {
  const counts = new Map<string, number>();
  for (const p of preds) {
    if (p.address?.city && p.address?.country) {
      const key = `${p.address.city}, ${p.address.country}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let best = "";
  let bestN = 0;
  for (const [loc, n] of counts) {
    if (n > bestN) {
      best = loc;
      bestN = n;
    }
  }
  return bestN > 1
    ? `${bestN} of ${preds.length} predictions point to ${best}`
    : null;
}

function coord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(6)}\u00B0${ns}, ${Math.abs(lon).toFixed(6)}\u00B0${ew}`;
}

function fmtDist(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function fmtTime(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function qualityLabel(km: number): { text: string; cls: string } {
  if (km < 1) return { text: "Excellent", cls: "text-emerald-600" };
  if (km < 25) return { text: "Good: City Level", cls: "text-blue-600" };
  if (km < 200) return { text: "Fair: Region Level", cls: "text-amber-600" };
  if (km < 750) return { text: "Poor: Country Level", cls: "text-orange-600" };
  return { text: "Off: Wrong Region", cls: "text-red-600" };
}

interface Props {
  result: AnalysisResult;
}

export default function ResultCard({ result }: Props) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  const top = result.predictions[0];
  const note = consensus(result.predictions);
  const meta = result.image_metadata;
  const bm = result.benchmark;

  const metaFields: [string, string][] = [];
  if (meta.camera) metaFields.push(["Camera", meta.camera]);
  if (meta.date_taken)
    metaFields.push(["Date", meta.date_taken.replace("T", " ")]);
  if (meta.width && meta.height)
    metaFields.push(["Dimensions", `${meta.width} \u00D7 ${meta.height}`]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
        {result.imageUrl && (
          <img
            src={result.imageUrl}
            alt={result.filename}
            className="w-9 h-9 rounded-lg object-cover flex-shrink-0 ring-1 ring-gray-200 dark:ring-gray-700"
          />
        )}
        <span
          className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex-1"
          title={result.filename}
        >
          {result.filename}
        </span>

        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.has_gps
              ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            }`}
        >
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
          GPS
        </span>

        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
          {fmtTime(result.processing_time_ms)}
        </span>
      </div>

      {/* body */}
      <div className="flex">
        {/* left column */}
        <div className="w-72 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3">
          {result.imageUrl && (
            <img
              src={result.imageUrl}
              alt={result.filename}
              className="w-full aspect-square rounded-xl object-cover bg-gray-100"
            />
          )}

          {/* Predicted location card */}
          {top && (
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/50 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
                  Predicted
                </h4>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                {formatAddr(top)}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                {coord(top.lat, top.lon)}
              </p>
              <GoogleMapsLink lat={top.lat} lon={top.lon} className="mt-1.5" />
              {note && (
                <p className="text-[11px] text-blue-600 mt-1.5">{note}</p>
              )}
            </div>
          )}

          {/* Exact spot refinement details */}
          {result.exact_details && (
            <ExactDetailsSection details={result.exact_details} />
          )}

          {/* Actual location card */}
          {result.real_location && (
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50/50 dark:from-emerald-950/50 dark:to-green-950/30 border border-emerald-100 dark:border-emerald-900 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <h4 className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                  Actual (EXIF)
                </h4>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">
                {result.real_location.address
                  ? [
                    result.real_location.address.city,
                    result.real_location.address.region,
                    result.real_location.address.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Unknown"
                  : "Unknown"}
              </p>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                {coord(result.real_location.lat, result.real_location.lon)}
              </p>
              <GoogleMapsLink
                lat={result.real_location.lat}
                lon={result.real_location.lon}
                className="mt-1.5"
              />
            </div>
          )}

          {bm && <BenchmarkSection benchmark={bm} />}

          {metaFields.length > 0 && (
            <div>
              <button
                onClick={() => setMetaOpen(!metaOpen)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${metaOpen ? "rotate-90" : ""}`}
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
                Metadata
              </button>
              {metaOpen && (
                <dl className="mt-2 space-y-1.5 animate-slide-down">
                  {metaFields.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] text-gray-400 uppercase tracking-wider">
                        {k}
                      </dt>
                      <dd className="text-xs text-gray-600">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>

        {/* right column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-96 border-b border-gray-100 dark:border-gray-800">
            <PredictionMap
              predictions={result.predictions}
              realLocation={result.real_location}
              benchmark={result.benchmark}
              selectedRank={selectedRank}
              onMarkerClick={setSelectedRank}
            />
          </div>
          <div className="p-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Raw Predictions
            </h4>
            <PredictionsTable
              predictions={result.predictions}
              distances={bm?.distances}
              selectedRank={selectedRank}
              onRowClick={setSelectedRank}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchmarkSection({ benchmark }: { benchmark: Benchmark }) {
  const q = qualityLabel(benchmark.top1_distance_km);
  const showBest = benchmark.best_prediction_rank !== 1;

  return (
    <section className="bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-800 dark:to-blue-950/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
      <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Benchmark
      </h4>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-gray-500">Top-1 Distance</span>
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          {fmtDist(benchmark.top1_distance_km)}
        </span>
      </div>
      <p className={`text-xs font-semibold mt-1 ${q.cls}`}>{q.text}</p>
      {showBest && (
        <div className="flex items-baseline justify-between gap-2 mt-2 pt-2 border-t border-gray-200">
          <span className="text-xs text-gray-500">
            Best (#{benchmark.best_prediction_rank})
          </span>
          <span className="text-xs font-medium text-gray-700 tabular-nums">
            {fmtDist(benchmark.best_distance_km)}
          </span>
        </div>
      )}
    </section>
  );
}

function ExactDetailsSection({ details }: { details: ExactDetails }) {
  const ocrOsm = details.ocr_osm || details.diagnostics?.ocr_osm;
  const mapillary = details.mapillary || details.diagnostics?.mapillary;
  const bestMatch = mapillary?.best_match;

  const hasOcrTexts = Boolean(ocrOsm?.texts && ocrOsm.texts.length > 0);
  const hasMatchedPois = Boolean(
    ocrOsm?.matched_pois && ocrOsm.matched_pois.length > 0,
  );
  const hasMapillaryMatch = Boolean(bestMatch?.thumb_url);

  return (
    <div className="rounded-xl bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-blue-50/30 dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-blue-950/20 border border-purple-200/80 dark:border-purple-900/60 p-3 shadow-sm space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 animate-pulse" />
          <h4 className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider truncate">
            Exact Spot
          </h4>
        </div>
        <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/80 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700 flex-shrink-0 tabular-nums">
          ±{details.radius_m}m
        </span>
      </div>

      {/* Refinement method */}
      <div>
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Method
        </div>
        <p className="text-xs font-semibold text-purple-950 dark:text-purple-100 leading-snug mt-0.5">
          {details.method}
        </p>
      </div>

      {/* OCR Texts */}
      {hasOcrTexts && (
        <div>
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Detected Text ({ocrOsm!.texts!.length})
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {ocrOsm!.texts!.map((txt, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/80 dark:bg-gray-800/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 max-w-full truncate"
                title={txt}
              >
                {txt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* OSM Matched POIs */}
      {hasMatchedPois && (
        <div>
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            OSM Objects ({ocrOsm!.matched_pois!.length})
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
            {ocrOsm!.matched_pois!.map((poi, idx) => (
              <div
                key={idx}
                className="text-xs bg-white/70 dark:bg-gray-900/70 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40"
              >
                <div
                  className="font-semibold text-gray-800 dark:text-gray-200 truncate"
                  title={poi.name}
                >
                  {poi.name}
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  <span
                    className="truncate max-w-[120px]"
                    title={`OCR: "${poi.ocr_text}"`}
                  >
                    Match: "{poi.ocr_text}"
                  </span>
                  <span className="font-mono flex-shrink-0">
                    {poi.lat.toFixed(4)}, {poi.lon.toFixed(4)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mapillary StreetView Match Preview */}
      {hasMapillaryMatch && (
        <div>
          <div className="flex items-center justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            <span>Mapillary Match</span>
            {bestMatch!.matched_keypoints != null && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {bestMatch!.matched_keypoints} keypoints
              </span>
            )}
          </div>
          <div className="relative rounded-lg overflow-hidden border border-purple-200 dark:border-purple-800 bg-black/10 group">
            <a
              href={`https://www.mapillary.com/app/?pKey=${bestMatch!.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open on Mapillary"
            >
              <img
                src={bestMatch!.thumb_url}
                alt="Mapillary Match Preview"
                className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                <span className="text-[10px] text-white underline">
                  Open on Mapillary
                </span>
              </div>
            </a>
            {bestMatch!.compass_angle != null && (
              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                {Math.round(bestMatch!.compass_angle)}°
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

