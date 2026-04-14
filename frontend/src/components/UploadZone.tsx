import { useCallback, useRef, useState } from "react";

import HelpTip from "./HelpTip";

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
          upload-zone cursor-pointer py-16 px-6 text-center
          ${isDragOver ? "upload-zone-active" : ""}
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
          <div className="animate-scale-in">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-indigo-100 dark:bg-indigo-900 animate-pulse-ring" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>
            </div>
            <p className="text-lg font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              Drop to analyze
            </p>
          </div>
        ) : (
          <>
            <div className="animate-float w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-indigo-400 dark:text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zM9 9.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
                />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
              Drop images here to analyze
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              or{" "}
              <span className="text-indigo-500 dark:text-indigo-400 font-medium hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors">
                browse files
              </span>
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {["JPG", "PNG", "WebP", "TIFF", "BMP"].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md"
                >
                  {fmt}
                </span>
              ))}
              <HelpTip text="Supported image formats. HEIC support varies by system. Maximum 50 files per batch, 50 MB per file." />
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-3 text-center animate-slide-down">
          {error}
        </p>
      )}
    </div>
  );
}
