"""Async directory scanner for image GPS detection.

Discovers images recursively, runs batch GPS detection via exiftool,
and exposes real-time progress through a thread-safe state object.
Only one scan can run at a time.
"""

import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app import exiftool
from app.gps_detect import extract_gps_from_tags

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".tiff",
        ".tif",
        ".webp",
        ".heic",
        ".heif",
        ".bmp",
        ".cr2",
        ".nef",
        ".arw",
        ".dng",
    }
)

_BATCH_SIZE = 50


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def discover_images(directory: str) -> list[str]:
    """Recursively find all image files under *directory*."""
    paths: list[str] = []
    for root, _dirs, files in os.walk(directory):
        for fname in files:
            if Path(fname).suffix.lower() in IMAGE_EXTENSIONS:
                paths.append(os.path.join(root, fname))
    paths.sort()
    return paths


def _parse_date(tags: dict) -> str | None:
    """Extract a human-readable date from exiftool tags."""
    raw = tags.get("EXIF:DateTimeOriginal") or tags.get("EXIF:CreateDate")
    if not raw or not isinstance(raw, str):
        return None
    try:
        parts = raw.strip().split(" ", 1)
        date_part = parts[0].replace(":", "-")
        time_part = parts[1] if len(parts) > 1 else "00:00:00"
        return f"{date_part}T{time_part}"
    except (IndexError, ValueError):
        return None


def _process_batch(
    paths: list[str],
    base_dir: str,
) -> list[dict]:
    """Run exiftool on a batch and return per-image info dicts."""
    tags_list = exiftool.read_metadata_batch(paths)
    results: list[dict] = []

    for path, tags in zip(paths, tags_list):
        p = Path(path)
        gps = extract_gps_from_tags(tags)

        try:
            file_size = p.stat().st_size
        except OSError:
            file_size = 0

        results.append(
            {
                "path": path,
                "relative_path": os.path.relpath(path, base_dir),
                "filename": p.name,
                "has_gps": gps.has_gps,
                "is_estimated": gps.is_estimated,
                "coordinates": gps.coordinates,
                "sources": gps.sources,
                "format": p.suffix.lstrip(".").lower(),
                "file_size": file_size,
                "date_taken": _parse_date(tags),
                "likely_null_island": gps.likely_null_island,
                "error": gps.error,
            }
        )

    return results


def _build_summary(base_dir: str, images: list[dict]) -> dict:
    """Aggregate per-image data into summary statistics."""
    format_counts: dict[str, int] = {}
    dir_data: dict[str, dict] = {}

    with_gps = 0
    without_gps = 0
    with_estimated = 0
    null_island = 0
    errors = 0
    gps_images: list[dict] = []

    for img in images:
        # Format
        fmt = img["format"]
        format_counts[fmt] = format_counts.get(fmt, 0) + 1

        # Directory
        rel_dir = str(Path(img["path"]).parent.relative_to(base_dir))
        if rel_dir not in dir_data:
            dir_data[rel_dir] = {
                "directory": rel_dir,
                "total": 0,
                "with_gps": 0,
                "without_gps": 0,
            }
        dir_data[rel_dir]["total"] += 1

        # Categorize
        if img.get("error"):
            errors += 1
        elif img["has_gps"]:
            with_gps += 1
            dir_data[rel_dir]["with_gps"] += 1
            if img["is_estimated"]:
                with_estimated += 1
            if img.get("likely_null_island"):
                null_island += 1
            gps_images.append(
                {
                    "path": img["path"],
                    "filename": img["filename"],
                    "lat": img["coordinates"]["lat"] if img["coordinates"] else None,
                    "lon": img["coordinates"]["lon"] if img["coordinates"] else None,
                    "is_estimated": img["is_estimated"],
                }
            )
        else:
            without_gps += 1
            dir_data[rel_dir]["without_gps"] += 1

    return {
        "total_images": len(images),
        "with_gps": with_gps,
        "without_gps": without_gps,
        "with_estimated_gps": with_estimated,
        "null_island": null_island,
        "errors": errors,
        "by_format": format_counts,
        "by_directory": sorted(dir_data.values(), key=lambda d: d["directory"]),
        "images": images,
        "gps_images": gps_images,
    }


# ---------------------------------------------------------------------------
# Scan manager (singleton)
# ---------------------------------------------------------------------------


class ScanManager:
    """Thread-safe manager for async directory scans."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._scan: dict | None = None

    @property
    def is_scanning(self) -> bool:
        with self._lock:
            return self._scan is not None and self._scan["status"] == "scanning"

    def start(self, directory: str) -> str:
        """Begin an async scan. Returns scan_id. Raises if already scanning."""
        with self._lock:
            if self._scan and self._scan["status"] == "scanning":
                raise RuntimeError("A scan is already in progress")

            scan_id = uuid.uuid4().hex[:8]
            self._scan = {
                "scan_id": scan_id,
                "status": "scanning",
                "directory": directory,
                "total": 0,
                "processed": 0,
                "error": None,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": None,
                # results stored here once complete
                "_results": None,
            }

        thread = threading.Thread(
            target=self._run, args=(scan_id, directory), daemon=True
        )
        thread.start()
        return scan_id

    def get_status(self, scan_id: str) -> dict | None:
        with self._lock:
            if not self._scan or self._scan["scan_id"] != scan_id:
                return None
            s = self._scan
            return {
                "scan_id": s["scan_id"],
                "status": s["status"],
                "directory": s["directory"],
                "total": s["total"],
                "processed": s["processed"],
                "error": s["error"],
                "started_at": s["started_at"],
                "completed_at": s["completed_at"],
            }

    def get_results(self, scan_id: str) -> dict | None:
        with self._lock:
            if not self._scan or self._scan["scan_id"] != scan_id:
                return None
            return self._scan.get("_results")

    # ---- background thread ------------------------------------------------

    def _run(self, scan_id: str, directory: str) -> None:
        try:
            image_paths = discover_images(directory)
            logger.info(
                "Scan %s: found %d images in %s", scan_id, len(image_paths), directory
            )

            with self._lock:
                if self._scan["scan_id"] != scan_id:
                    return
                self._scan["total"] = len(image_paths)

            if not image_paths:
                self._finish(scan_id, _build_summary(directory, []))
                return

            all_images: list[dict] = []

            for i in range(0, len(image_paths), _BATCH_SIZE):
                chunk = image_paths[i : i + _BATCH_SIZE]
                batch_info = _process_batch(chunk, directory)
                all_images.extend(batch_info)

                with self._lock:
                    if self._scan["scan_id"] != scan_id:
                        return
                    self._scan["processed"] = len(all_images)

            results = _build_summary(directory, all_images)
            self._finish(scan_id, results)

        except Exception as exc:
            logger.exception("Scan %s failed", scan_id)
            with self._lock:
                if self._scan and self._scan["scan_id"] == scan_id:
                    self._scan["status"] = "error"
                    self._scan["error"] = str(exc)
                    self._scan["completed_at"] = datetime.now(timezone.utc).isoformat()

    def _finish(self, scan_id: str, results: dict) -> None:
        with self._lock:
            if self._scan and self._scan["scan_id"] == scan_id:
                self._scan["status"] = "complete"
                self._scan["_results"] = results
                self._scan["processed"] = results["total_images"]
                self._scan["completed_at"] = datetime.now(timezone.utc).isoformat()


# Module-level singleton
scan_manager = ScanManager()
