import { useCallback, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tiff",
  ".tif",
  ".bmp",
];
const ACCEPTED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/bmp",
];
const MAX_FILES = 50;

interface Props {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFilesSelected, disabled }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((list: FileList | File[]): File[] => {
    const all = Array.from(list);

    if (all.length > MAX_FILES) {
      setError(
        `Maximum ${MAX_FILES} files per batch. You selected ${all.length}.`,
      );
      return [];
    }

    const valid: File[] = [];
    const bad: string[] = [];

    for (const f of all) {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      if (
        ACCEPTED_MIMES.includes(f.type) ||
        ACCEPTED_EXTENSIONS.includes(ext)
      ) {
        valid.push(f);
      } else {
        bad.push(f.name);
      }
    }

    if (bad.length > 0) {
      setError(
        `Rejected ${bad.length} non-image file(s): ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`,
      );
    } else {
      setError(null);
    }

    return valid;
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const valid = validate(e.dataTransfer.files);
      if (valid.length) onFilesSelected(valid);
    },
    [disabled, onFilesSelected, validate],
  );

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const valid = validate(e.target.files);
        if (valid.length) onFilesSelected(valid);
      }
      e.target.value = "";
    },
    [onFilesSelected, validate],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed
          transition-all duration-200 py-14 px-6 text-center
          ${
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={onInput}
          className="hidden"
        />

        {isDragOver ? (
          <p className="text-lg text-blue-600 font-medium">Drop images here</p>
        ) : (
          <>
            <svg
              className="w-10 h-10 mx-auto mb-3 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-gray-700 font-medium">
              Drag &amp; drop images here
            </p>
            <p className="text-sm text-gray-400 mt-1">or click to browse</p>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2 text-center">
        JPG, PNG, WebP, TIFF, BMP &middot; Max 50 files per batch
      </p>

      {error && (
        <p className="text-sm text-red-500 mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
