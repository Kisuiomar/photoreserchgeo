import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface Pred {
  rank: number;
  lat: number;
  lon: number;
  probability: number;
  address: { city: string; region: string; country: string } | null;
}

interface Props {
  imageId: string;
  filename: string;
  thumbnail: string;
  predictions: Pred[];
  onAccept: () => void;
  onReject: () => void;
  onManual: (address: string) => void;
  busy: boolean;
  feedback: string | null;
}

function FitPreds({ preds }: { preds: Pred[] }) {
  const map = useMap();
  useEffect(() => {
    if (preds.length === 0) return;
    const pts: L.LatLngTuple[] = preds.map((p) => [p.lat, p.lon]);
    if (pts.length === 1) map.setView(pts[0], 8);
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 12 });
  }, [map, preds]);
  return null;
}

function fmtAddr(
  a: { city?: string; region?: string; country?: string } | null,
) {
  if (!a) return "Unknown";
  return [a.city, a.region, a.country].filter(Boolean).join(", ") || "Unknown";
}

export default function ReviewCard({
  filename,
  thumbnail,
  predictions,
  onAccept,
  onReject,
  onManual,
  busy,
  feedback,
}: Props) {
  const [showManual, setShowManual] = useState(false);
  const [address, setAddress] = useState("");
  const addrRef = useRef<HTMLInputElement>(null);

  const top = predictions[0];

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "a" || (e.key === "Enter" && !showManual)) onAccept();
      else if (e.key === "r" || e.key === "Escape") onReject();
      else if (e.key === "m") {
        setShowManual(true);
        setTimeout(() => addrRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onAccept, onReject, showManual]);

  const handleManualSubmit = useCallback(() => {
    if (address.trim()) {
      onManual(address.trim());
      setAddress("");
      setShowManual(false);
    }
  }, [address, onManual]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-2xl overflow-hidden">
      <div className="flex">
        {/* Left: image */}
        <div className="w-80 flex-shrink-0 p-4 border-r border-gray-100 dark:border-gray-800">
          {thumbnail && (
            <img
              src={`data:image/jpeg;base64,${thumbnail}`}
              alt={filename}
              className="w-full rounded-xl object-contain bg-gray-100 max-h-72"
            />
          )}
          <p
            className="text-sm text-gray-700 dark:text-gray-300 mt-3 truncate"
            title={filename}
          >
            {filename}
          </p>

          {top && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Top Prediction
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {fmtAddr(top.address)}
              </p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                {top.lat.toFixed(6)}, {top.lon.toFixed(6)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(top.probability * 100).toFixed(1)}% confidence
              </p>
            </div>
          )}

          {/* All predictions */}
          {predictions.length > 1 && (
            <div className="mt-3 space-y-1">
              {predictions.slice(1).map((p) => (
                <div
                  key={p.rank}
                  className="flex justify-between text-xs text-gray-500 dark:text-gray-400"
                >
                  <span>
                    #{p.rank} {fmtAddr(p.address)}
                  </span>
                  <span className="tabular-nums">
                    {(p.probability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: map + actions */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-64">
            <MapContainer
              center={[20, 0]}
              zoom={2}
              className="h-full w-full"
              style={{ background: "#f0f0f0" }}
              scrollWheelZoom={true}
            >
              <TileLayer url={TILES} attribution={ATTR} />
              <FitPreds preds={predictions} />
              {predictions.map((p) => (
                <CircleMarker
                  key={p.rank}
                  center={[p.lat, p.lon]}
                  radius={p.rank === 1 ? 8 : 5}
                  pathOptions={{
                    color: p.rank === 1 ? "#3b82f6" : "#6b7280",
                    fillColor: p.rank === 1 ? "#3b82f6" : "#6b7280",
                    fillOpacity: p.rank === 1 ? 0.8 : 0.4,
                    weight: 2,
                  }}
                >
                  <Tooltip direction="top">
                    <div style={{ fontSize: 11 }}>
                      <strong>#{p.rank}</strong> · {fmtAddr(p.address)}
                      <br />
                      {(p.probability * 100).toFixed(1)}%
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            {feedback && (
              <p
                className={`text-sm font-medium ${feedback.startsWith("GPS") ? "text-emerald-600" : feedback.startsWith("Skipped") ? "text-gray-500" : "text-blue-600"}`}
              >
                {feedback}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onAccept}
                disabled={busy}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Accept (A)
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
              >
                Reject (R)
              </button>
              <button
                onClick={() => {
                  setShowManual(true);
                  setTimeout(() => addrRef.current?.focus(), 50);
                }}
                disabled={busy}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Manual (M)
              </button>
            </div>

            {showManual && (
              <div className="flex gap-2">
                <input
                  ref={addrRef}
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                  placeholder="Address (e.g. Marienplatz, München)"
                  className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={busy || !address.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
                >
                  Geocode
                </button>
              </div>
            )}

            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Shortcuts: A/Enter = Accept, R/Esc = Reject, M = Manual input
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
