interface Props {
  lat: number;
  lon: number;
  className?: string;
}

export default function GoogleMapsLink({ lat, lon, className = "" }: Props) {
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lon}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors ${className}`}
      title="Open in Google Maps"
    >
      <svg
        className="w-3.5 h-3.5"
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
      <span className="text-xs font-medium">Google Maps</span>
    </a>
  );
}
