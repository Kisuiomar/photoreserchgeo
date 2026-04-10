import type { Prediction } from "../types";

function fmtDist(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function fmtAddr(
  addr: { city?: string; region?: string; country?: string } | null,
): string {
  if (!addr) return "\u2014";
  const parts = [addr.city, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "\u2014";
}

interface Props {
  predictions: Prediction[];
  distances?: number[] | null;
  selectedRank?: number | null;
  onRowClick?: (rank: number) => void;
}

export default function PredictionsTable({
  predictions,
  distances,
  selectedRank,
  onRowClick,
}: Props) {
  const maxProb = Math.max(...predictions.map((p) => p.probability));
  const hasDist = distances && distances.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-200">
            <th className="text-left py-1.5 pr-2 font-medium">#</th>
            <th className="text-left py-1.5 pr-2 font-medium">Location</th>
            <th className="text-left py-1.5 pr-2 font-medium">Lat</th>
            <th className="text-left py-1.5 pr-2 font-medium">Lon</th>
            <th className="text-right py-1.5 pr-2 font-medium">Prob</th>
            <th className="text-left py-1.5 font-medium w-20" />
            {hasDist && (
              <th className="text-right py-1.5 pl-2 font-medium">Dist</th>
            )}
            <th className="text-right py-1.5 pl-2 font-medium w-8" />
          </tr>
        </thead>
        <tbody>
          {predictions.map((p, i) => {
            const pct = p.probability * 100;
            const barW = maxProb > 0 ? (p.probability / maxProb) * 100 : 0;
            const isTop = p.rank === 1;
            const isSelected = p.rank === selectedRank;
            const dist = hasDist ? distances[i] : undefined;

            return (
              <tr
                key={p.rank}
                onClick={() => onRowClick?.(p.rank)}
                className={`border-b border-gray-100 transition-colors ${
                  isSelected ? "bg-blue-50" : isTop ? "bg-blue-50/50" : ""
                } ${onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
              >
                <td
                  className={`py-1.5 pr-2 tabular-nums ${isTop ? "text-blue-600 font-semibold" : "text-gray-400"}`}
                >
                  {p.rank}
                </td>
                <td
                  className={`py-1.5 pr-2 max-w-[140px] truncate ${isTop ? "text-gray-900 font-medium" : "text-gray-600"}`}
                  title={
                    p.address
                      ? [p.address.city, p.address.region, p.address.country]
                          .filter(Boolean)
                          .join(", ")
                      : undefined
                  }
                >
                  {fmtAddr(p.address)}
                </td>
                <td
                  className={`py-1.5 pr-2 font-mono tabular-nums ${isTop ? "text-gray-900" : "text-gray-500"}`}
                >
                  {p.lat.toFixed(4)}
                </td>
                <td
                  className={`py-1.5 pr-2 font-mono tabular-nums ${isTop ? "text-gray-900" : "text-gray-500"}`}
                >
                  {p.lon.toFixed(4)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  <span
                    className={
                      isTop ? "text-gray-900 font-medium" : "text-gray-500"
                    }
                  >
                    {pct.toFixed(1)}%
                  </span>
                </td>
                <td className="py-1.5">
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isTop ? "bg-blue-500" : "bg-gray-300"}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </td>
                {hasDist && dist !== undefined && (
                  <td className="py-1.5 pl-2 text-right tabular-nums text-gray-500 whitespace-nowrap">
                    {fmtDist(dist)}
                  </td>
                )}
                <td className="py-1.5 pl-2 text-right">
                  <a
                    href={`https://www.google.com/maps?q=${p.lat},${p.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-500 hover:text-blue-700 transition-colors"
                    title="Open in Google Maps"
                  >
                    <svg
                      className="w-3.5 h-3.5 inline"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
