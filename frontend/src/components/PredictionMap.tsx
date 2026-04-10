import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import type { Benchmark, Prediction, RealLocation } from "../types";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function predIcon(
  rank: number,
  probability: number,
  maxProb: number,
): L.DivIcon {
  const isTop = rank === 1;
  const size = isTop ? 30 : 22;
  const opacity = isTop ? 1 : 0.4 + (probability / maxProb) * 0.5;
  const bg = isTop ? "#2563eb" : `rgba(100,116,139,${opacity.toFixed(2)})`;

  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
      border-radius:50%;font-size:${isTop ? 12 : 10}px;font-weight:700;
      color:#fff;background:${bg};
      border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.2);
      font-family:Inter,system-ui,sans-serif;
    ">${rank}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const REAL_ICON = L.divIcon({
  className: "",
  html: `<div style="
    width:30px;height:30px;display:flex;align-items:center;justify-content:center;
    border-radius:50%;background:#059669;
    border:2.5px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,.2);
  "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="8"/>
    <line x1="12" y1="16" x2="12" y2="22"/><line x1="2" y1="12" x2="8" y2="12"/>
    <line x1="16" y1="12" x2="22" y2="12"/>
  </svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function distanceLabelIcon(km: number): L.DivIcon {
  const text =
    km < 0.1
      ? `${Math.round(km * 1000)}m`
      : km < 10
        ? `${km.toFixed(1)} km`
        : `${Math.round(km)} km`;
  return L.divIcon({
    className: "",
    html: `<span style="
      background:#fff;padding:3px 8px;border-radius:6px;font-size:11px;
      color:#d97706;white-space:nowrap;border:1px solid #e5e7eb;
      font-family:Inter,system-ui,sans-serif;font-weight:600;
      box-shadow:0 2px 6px rgba(0,0,0,.1);
    ">${text}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 8],
  });
}

function fmtAddr(
  addr: { city?: string; region?: string; country?: string } | null,
): string {
  if (!addr) return "Unknown";
  return (
    [addr.city, addr.region, addr.country].filter(Boolean).join(", ") ||
    "Unknown"
  );
}

function FitBounds({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10);
      return;
    }
    const bounds = L.latLngBounds(points);
    // Use generous padding so markers aren't at edges, and allow
    // zooming in close when predictions cluster tightly.
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], Math.max(map.getZoom(), 8), { duration: 0.4 });
  }, [map, lat, lon]);
  return null;
}

interface Props {
  predictions: Prediction[];
  realLocation: RealLocation | null;
  benchmark: Benchmark | null;
  selectedRank: number | null;
  onMarkerClick: (rank: number) => void;
}

export default function PredictionMap({
  predictions,
  realLocation,
  benchmark,
  selectedRank,
  onMarkerClick,
}: Props) {
  const maxProb = Math.max(...predictions.map((p) => p.probability));

  const allPoints = useMemo<L.LatLngTuple[]>(() => {
    const pts: L.LatLngTuple[] = predictions.map((p) => [p.lat, p.lon]);
    if (realLocation) pts.push([realLocation.lat, realLocation.lon]);
    return pts;
  }, [predictions, realLocation]);

  const flyTarget =
    selectedRank !== null
      ? predictions.find((p) => p.rank === selectedRank)
      : null;

  const top1 = predictions[0];
  const showTop1Line = realLocation && top1;
  const top1Mid: L.LatLngTuple | null = showTop1Line
    ? [(realLocation.lat + top1.lat) / 2, (realLocation.lon + top1.lon) / 2]
    : null;

  const bestRank = benchmark?.best_prediction_rank ?? 1;
  const bestPred = bestRank !== 1 ? predictions[bestRank - 1] : null;
  const showBestLine = realLocation && bestPred;

  // Thin context lines from every other prediction to actual
  const otherPreds = realLocation
    ? predictions.filter((p) => p.rank !== 1 && p.rank !== bestRank)
    : [];

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      className="h-full w-full rounded-xl"
      style={{ background: "#f0f0f0" }}
      scrollWheelZoom={true}
    >
      <TileLayer url={TILES} attribution={ATTR} />
      <FitBounds points={allPoints} />
      {flyTarget && <FlyTo lat={flyTarget.lat} lon={flyTarget.lon} />}

      {[...predictions].reverse().map((p) => (
        <Marker
          key={`p-${p.rank}`}
          position={[p.lat, p.lon]}
          icon={predIcon(p.rank, p.probability, maxProb)}
          eventHandlers={{ click: () => onMarkerClick(p.rank) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              <strong>#{p.rank}</strong> — {(p.probability * 100).toFixed(1)}%
              <br />
              {p.lat.toFixed(6)}, {p.lon.toFixed(6)}
              <br />
              {fmtAddr(p.address)}
              {benchmark && benchmark.distances[p.rank - 1] !== undefined && (
                <>
                  <br />
                  <em>
                    {benchmark.distances[p.rank - 1] < 0.1
                      ? `${Math.round(benchmark.distances[p.rank - 1] * 1000)}m`
                      : `${benchmark.distances[p.rank - 1].toFixed(1)} km`}{" "}
                    from actual
                  </em>
                </>
              )}
            </div>
          </Tooltip>
        </Marker>
      ))}

      {realLocation && (
        <Marker
          position={[realLocation.lat, realLocation.lon]}
          icon={REAL_ICON}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              <strong>Actual Location</strong>
              <br />
              {realLocation.lat.toFixed(6)}, {realLocation.lon.toFixed(6)}
              <br />
              {fmtAddr(realLocation.address)}
            </div>
          </Tooltip>
        </Marker>
      )}

      {showTop1Line && (
        <Polyline
          positions={[
            [realLocation.lat, realLocation.lon],
            [top1.lat, top1.lon],
          ]}
          pathOptions={{
            color: "#d97706",
            weight: 2.5,
            dashArray: "8 6",
            opacity: 0.8,
          }}
        />
      )}
      {showTop1Line && top1Mid && benchmark && (
        <Marker
          position={top1Mid}
          icon={distanceLabelIcon(benchmark.top1_distance_km)}
          interactive={false}
        />
      )}
      {showBestLine && bestPred && (
        <Polyline
          positions={[
            [realLocation.lat, realLocation.lon],
            [bestPred.lat, bestPred.lon],
          ]}
          pathOptions={{
            color: "#059669",
            weight: 1.5,
            dashArray: "4 4",
            opacity: 0.6,
          }}
        />
      )}
      {/* Thin context lines from all remaining predictions to actual */}
      {realLocation &&
        otherPreds.map((p) => (
          <Polyline
            key={`line-${p.rank}`}
            positions={[
              [realLocation.lat, realLocation.lon],
              [p.lat, p.lon],
            ]}
            pathOptions={{
              color: "#94a3b8",
              weight: 1,
              dashArray: "2 4",
              opacity: 0.35,
            }}
          />
        ))}
    </MapContainer>
  );
}
