"""Snapshot persistence and comparison for directory scans.

Snapshots are plain JSON files stored in the configured snapshots
directory.  Comparison produces a detailed diff that highlights
safety-critical changes (GPS removed, GPS changed).
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger(__name__)


def _safe_name(name: str) -> str:
    """Sanitize a snapshot name to a filesystem-safe string."""
    cleaned = re.sub(r"[^\w\-]", "_", name).strip("_")
    return cleaned or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def save(name: str, scan_results: dict) -> dict:
    """Persist scan results as a named snapshot. Returns metadata."""
    os.makedirs(settings.snapshots_dir, exist_ok=True)
    safe = _safe_name(name)

    snapshot = {
        "name": safe,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_images": scan_results["total_images"],
            "with_gps": scan_results["with_gps"],
            "without_gps": scan_results["without_gps"],
            "with_estimated_gps": scan_results["with_estimated_gps"],
            "null_island": scan_results["null_island"],
            "errors": scan_results["errors"],
        },
        "images": scan_results["images"],
    }

    path = os.path.join(settings.snapshots_dir, f"{safe}.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(snapshot, fh)
    os.replace(tmp, path)

    logger.info("Saved snapshot '%s' (%d images)", safe, len(scan_results["images"]))
    return {
        "name": safe,
        "created_at": snapshot["created_at"],
        "total_images": snapshot["summary"]["total_images"],
    }


def list_all() -> list[dict]:
    """Return metadata for every saved snapshot."""
    d = settings.snapshots_dir
    if not os.path.isdir(d):
        return []

    items: list[dict] = []
    for fname in sorted(os.listdir(d)):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fname)) as fh:
                data = json.load(fh)
            items.append(
                {
                    "name": data["name"],
                    "created_at": data["created_at"],
                    "total_images": data["summary"]["total_images"],
                    "with_gps": data["summary"]["with_gps"],
                }
            )
        except (json.JSONDecodeError, KeyError, OSError):
            logger.warning("Skipping corrupt snapshot file %s", fname)
    return items


def load(name: str) -> dict | None:
    """Load a snapshot by name.  Returns ``None`` if not found."""
    safe = _safe_name(name)
    path = os.path.join(settings.snapshots_dir, f"{safe}.json")
    if not os.path.isfile(path):
        return None
    with open(path) as fh:
        return json.load(fh)


def compare(snap_a: dict, snap_b: dict) -> dict:
    """Diff two snapshots.  Flags safety-critical GPS removals/changes."""
    a_map = {img["path"]: img for img in snap_a["images"]}
    b_map = {img["path"]: img for img in snap_b["images"]}

    a_paths = set(a_map)
    b_paths = set(b_map)

    images_added = [b_map[p] for p in sorted(b_paths - a_paths)]
    images_removed = [a_map[p] for p in sorted(a_paths - b_paths)]

    gps_added: list[dict] = []
    gps_removed: list[dict] = []
    gps_changed: list[dict] = []
    estimated_added: list[dict] = []

    for p in sorted(a_paths & b_paths):
        a, b = a_map[p], b_map[p]
        a_gps = a.get("has_gps", False)
        b_gps = b.get("has_gps", False)

        if not a_gps and b_gps:
            gps_added.append({"path": p, "new_coordinates": b.get("coordinates")})
            if b.get("is_estimated"):
                estimated_added.append({"path": p, "coordinates": b.get("coordinates")})
        elif a_gps and not b_gps:
            gps_removed.append({"path": p, "old_coordinates": a.get("coordinates")})
        elif a_gps and b_gps:
            ac = a.get("coordinates") or {}
            bc = b.get("coordinates") or {}
            if ac.get("lat") != bc.get("lat") or ac.get("lon") != bc.get("lon"):
                gps_changed.append(
                    {
                        "path": p,
                        "old_coordinates": a.get("coordinates"),
                        "new_coordinates": b.get("coordinates"),
                    }
                )

    warnings: list[str] = []
    if gps_removed:
        warnings.append(
            f"WARNING: {len(gps_removed)} image(s) LOST GPS data between snapshots"
        )
    if gps_changed:
        warnings.append(
            f"WARNING: {len(gps_changed)} image(s) had GPS coordinates CHANGE between snapshots"
        )

    return {
        "snapshot_a": snap_a["name"],
        "snapshot_b": snap_b["name"],
        "images_added": images_added,
        "images_removed": images_removed,
        "gps_added": gps_added,
        "gps_removed": gps_removed,
        "gps_changed": gps_changed,
        "estimated_added": estimated_added,
        "summary": {
            "images_added": len(images_added),
            "images_removed": len(images_removed),
            "gps_added": len(gps_added),
            "gps_removed": len(gps_removed),
            "gps_changed": len(gps_changed),
            "estimated_added": len(estimated_added),
        },
        "warnings": warnings,
    }
