import { Fragment, useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import type { AnalysisResult } from "../types";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function labelIcon(filename: string): L.DivIcon {
  const label =
    filename.length > 16 ? filename.slice(0, 13) + "\u2026" : filename;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.15);"></div>
      <span style="font-size:10px;color:#374151;margin-top:2px;white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,.8);font-family:Inter,system-ui,sans-serif;font-weight:500;">${label}</span>
    </div>`,
    iconSize: [120, 32],
    iconAnchor: [60, 7],
  });
}

const REAL_DOT = L.divIcon({
  className: "",
  html: `<div style="width:10px;height:10px;border-radius:50%;background:#059669;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.15);"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function FitAll({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
    }
  }, [map, points]);
  return null;
}

interface Props {
  results: AnalysisResult[];
  onMarkerClick: (id: string) => void;
}

export default function OverviewMap({ results, onMarkerClick }: Props) {
  const allPoints = useMemo<L.LatLngTuple[]>(() => {
    const pts: L.LatLngTuple[] = [];
    for (const r of results) {
      if (r.predictions[0])
        pts.push([r.predictions[0].lat, r.predictions[0].lon]);
      if (r.real_location) pts.push([r.real_location.lat, r.real_location.lon]);
    }
    return pts;
  }, [results]);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: 440, background: "#f0f0f0" }}
      scrollWheelZoom={true}
    >
      <TileLayer url={TILES} attribution={ATTR} />
      <FitAll points={allPoints} />

      {results.map((r) => {
        const top = r.predictions[0];
        if (!top) return null;
        return (
          <Fragment key={r.id}>
            <Marker
              position={[top.lat, top.lon]}
              icon={labelIcon(r.filename)}
              eventHandlers={{ click: () => onMarkerClick(r.id) }}
            >
              <Tooltip direction="top" offset={[0, -16]}>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                  <strong>{r.filename}</strong>
                  <br />
                  {top.address
                    ? `${top.address.city}, ${top.address.country}`
                    : `${top.lat.toFixed(3)}, ${top.lon.toFixed(3)}`}
                  <br />
                  {(top.probability * 100).toFixed(1)}% confidence
                </div>
              </Tooltip>
            </Marker>
            {r.real_location && (
              <>
                <Marker
                  position={[r.real_location.lat, r.real_location.lon]}
                  icon={REAL_DOT}
                />
                <Polyline
                  positions={[
                    [r.real_location.lat, r.real_location.lon],
                    [top.lat, top.lon],
                  ]}
                  pathOptions={{
                    color: "#d97706",
                    weight: 1.5,
                    dashArray: "6 4",
                    opacity: 0.5,
                  }}
                />
              </>
            )}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
