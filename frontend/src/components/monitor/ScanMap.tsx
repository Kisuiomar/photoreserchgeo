import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import type { GpsImage } from "../../types";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function FitAll({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 5);
    } else {
      map.fitBounds(L.latLngBounds(points), {
        padding: [40, 40],
        maxZoom: 12,
      });
    }
  }, [map, points]);
  return null;
}

interface Props {
  gpsImages: GpsImage[];
}

export default function ScanMap({ gpsImages }: Props) {
  const points = useMemo<L.LatLngTuple[]>(
    () =>
      gpsImages
        .filter((g) => g.lat != null && g.lon != null)
        .map((g) => [g.lat!, g.lon!]),
    [gpsImages],
  );

  if (points.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full"
        style={{ height: 360, background: "#f0f0f0" }}
        scrollWheelZoom={true}
      >
        <TileLayer url={TILES} attribution={ATTR} />
        <FitAll points={points} />

        {gpsImages.map((g) => {
          if (g.lat == null || g.lon == null) return null;
          const color = g.is_estimated ? "#3b82f6" : "#10b981";
          return (
            <CircleMarker
              key={g.path}
              center={[g.lat, g.lon]}
              radius={4}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                  <strong>{g.filename}</strong>
                  <br />
                  {g.lat.toFixed(6)}, {g.lon.toFixed(6)}
                  <br />
                  {g.is_estimated ? "Estimated GPS" : "Real GPS"}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
