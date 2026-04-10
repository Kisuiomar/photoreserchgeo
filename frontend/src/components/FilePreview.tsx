import type { SelectedFile } from "../types";

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export default function FilePreview({ files, onRemove, disabled }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-3 bg-white border border-gray-200 shadow-sm rounded-2xl p-2 pr-3"
        >
          <img
            src={f.previewUrl}
            alt={f.file.name}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 truncate" title={f.file.name}>
              {f.file.name}
            </p>
            <p className="text-xs text-gray-400">{fmt(f.file.size)}</p>
          </div>

          {f.status === "processing" && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {f.status === "done" && (
            <span className="text-emerald-500 flex-shrink-0">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
          )}
          {f.status === "error" && (
            <span className="text-xs text-red-500 flex-shrink-0 max-w-[120px] truncate">
              {f.error || "Failed"}
            </span>
          )}

          {f.status === "pending" && !disabled && (
            <button
              onClick={() => onRemove(f.id)}
              className="text-gray-400 hover:text-gray-700 transition-colors p-1 flex-shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
